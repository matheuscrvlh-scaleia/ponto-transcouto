import { useState, type FormEvent } from 'react'
import { Campo } from '../../components/Campo'
import { Aviso } from '../../components/Estados'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { diasEntre, formatarData, hojeISO, somarDias } from '../../lib/formato'
import type { PedidoDadosResposta, PreviaDadosIntegracao, SemanaPrevia, StatusIntegracao } from '../../types/api'

/** Mesmo limite do server (ele dá a palavra final). */
const MAX_DIAS = 93
const DIAS_PADRAO = 7
/** No tempo real só entram fechamentos do mês: o período padrão cobre o último deles. */
const DIAS_PADRAO_TEMPO_REAL = 45
const MOTIVO_MINIMO = 5
/** RH e gestor só puxam dados recentes (mesmo limite do server); períodos antigos ficam com a equipe. */
const JANELA_CLIENTE_DIAS = 45

interface Props {
  status: StatusIntegracao
  query: { empresa_id?: number }
  /** Motivo para não deixar pedir (ex.: sem credenciais); null = liberado. */
  bloqueio: string | null
  /** Texto de quem não tem unidade para puxar. */
  semUnidades: string
  onPedido: (mensagem: string) => void
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

function formatarHoras(horas: number) {
  if (!horas || horas <= 0) return 'poucos minutos'
  if (horas < 1) return `cerca de ${Math.max(1, Math.ceil(horas * 60))} min`
  return `cerca de ${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}

function textoPedido({ fechamentos, ciclos_criados, dependentes }: PedidoDadosResposta, tempoReal: boolean) {
  const partes = [
    tempoReal
      ? `${plural(fechamentos, 'extração', 'extrações')} na fila`
      : `${plural(fechamentos, 'fechamento', 'fechamentos')} na fila`,
  ]
  if (ciclos_criados > 0) {
    partes.push(
      tempoReal
        ? plural(ciclos_criados, 'fechamento do mês novo criado', 'fechamentos do mês novos criados')
        : plural(ciclos_criados, 'semana nova criada', 'semanas novas criadas'),
    )
  }
  if (dependentes > 0) partes.push(`${plural(dependentes, 'refeito', 'refeitos')} junto para manter os saldos`)
  const inicio = tempoReal ? 'Pedido para refazer o fechamento do mês enviado' : 'Pedido de dados enviado'
  return `${inicio}: ${partes.join(', ')}. Acompanhe em Execuções recentes.`
}

/**
 * "Puxar dados": período + unidade → prévia → confirmação.
 * Empresa em tempo real não tem fotografia semanal: vira "Refazer fechamento do mês" e o server
 * só considera os fechamentos do mês dentro do período.
 */
export function PuxarDados({ status, query, bloqueio, semUnidades, onPedido }: Props) {
  const tempoReal = Boolean(status.tempo_real?.ativo)
  const { usuario } = useAuth()
  const hoje = hojeISO()
  const minimo = usuario?.tipo === 'cliente' ? somarDias(hoje, -JANELA_CLIENTE_DIAS) : undefined
  const [inicio, setInicio] = useState(() => {
    const padrao = somarDias(hoje, -(tempoReal ? DIAS_PADRAO_TEMPO_REAL : DIAS_PADRAO))
    return minimo && padrao < minimo ? minimo : padrao
  })
  const [fim, setFim] = useState(hoje)
  const [unidadeId, setUnidadeId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [previa, setPrevia] = useState<{ chave: string; dados: PreviaDadosIntegracao } | null>(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroMotivo, setErroMotivo] = useState('')

  const { unidades } = status
  const unidadeUnica = unidades.length === 1 ? unidades[0] : null
  const unidadeEfetiva = unidadeUnica ? String(unidadeUnica.id) : unidadeId
  // a prévia só vale para o período e a unidade com que foi pedida (e para o modo da empresa)
  const chave = `${inicio}|${fim}|${unidadeEfetiva}|${tempoReal}`
  const previaValida = previa?.chave === chave ? previa.dados : null
  const previaVencida = previa !== null && !previaValida
  const travado = Boolean(bloqueio) || unidades.length === 0

  function validarPeriodo() {
    if (!inicio || !fim) return 'Informe as datas de início e de fim.'
    if (inicio > fim) return 'A data de início precisa ser igual ou anterior à data de fim.'
    if (fim > hoje) return 'A data de fim não pode ser no futuro.'
    if (minimo && inicio < minimo) {
      return `Você pode puxar dados a partir de ${formatarData(minimo)}. Para períodos mais antigos, fale com a equipe Scale IA.`
    }
    if (diasEntre(inicio, fim) > MAX_DIAS) return `O período pode ter no máximo ${MAX_DIAS} dias.`
    return null
  }

  async function verPrevia() {
    setErro('')
    const problema = validarPeriodo()
    if (problema) {
      setPrevia(null)
      return setErro(problema)
    }
    const pedida = chave
    setCarregandoPrevia(true)
    try {
      const dados = await api<PreviaDadosIntegracao>('/integracao/dados/previa', {
        query: { ...query, inicio, fim, unidade_id: unidadeEfetiva || undefined },
      })
      setPrevia({ chave: pedida, dados })
    } catch (e) {
      setPrevia(null)
      setErro(mensagemDeErro(e))
    } finally {
      setCarregandoPrevia(false)
    }
  }

  async function confirmar() {
    if (!previaValida) return
    setErro('')
    setErroMotivo('')
    const limpo = motivo.trim()
    if (limpo && limpo.length < MOTIVO_MINIMO) {
      return setErroMotivo(`O motivo precisa de ao menos ${MOTIVO_MINIMO} caracteres (ou deixe em branco).`)
    }
    setEnviando(true)
    try {
      const resposta = await api<PedidoDadosResposta>('/integracao/dados', {
        method: 'POST',
        query,
        json: { inicio, fim, unidade_id: unidadeEfetiva ? Number(unidadeEfetiva) : undefined, motivo: limpo || undefined },
      })
      setPrevia(null)
      setMotivo('')
      onPedido(textoPedido(resposta, tempoReal))
    } catch (e) {
      // 429 (limite de pedidos) e 400 chegam com a mensagem pronta em `error`
      setErroMotivo(errosDeCampos(e).motivo ?? '')
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  function enviar(event: FormEvent) {
    event.preventDefault()
    if (travado || carregandoPrevia || enviando) return
    if (previaValida) void confirmar()
    else void verPrevia()
  }

  return (
    <form className="integ-form" onSubmit={enviar} noValidate>
      {bloqueio ? (
        <p className="integ-texto">{bloqueio}</p>
      ) : unidades.length === 0 ? (
        <p className="integ-texto">{semUnidades}</p>
      ) : tempoReal ? (
        <p className="integ-texto">
          Busca de novo as horas dos <strong>fechamentos do mês</strong> que caem no período e regrava o registro oficial (o
          saldo que passa para o mês seguinte). Os números ao vivo não dependem disto: para atualizar todo mundo agora, use
          “Atualizar todos agora” no cartão Tempo real. Veja a prévia antes de confirmar: ela mostra quais fechamentos entram
          e quanto tempo a extração deve levar.
        </p>
      ) : (
        <p className="integ-texto">
          Busca de novo as horas das semanas do período e republica o painel. Veja a prévia antes de confirmar: ela mostra
          quais semanas entram e quanto tempo a extração deve levar.
        </p>
      )}

      <div className="integ-form-grade">
        <Campo rotulo="Data início">
          {(props) => (
            <input
              {...props}
              type="date"
              value={inicio}
              min={minimo}
              max={fim && fim < hoje ? fim : hoje}
              onChange={(event) => setInicio(event.target.value)}
              disabled={travado}
              required
            />
          )}
        </Campo>
        <Campo rotulo="Data fim">
          {(props) => (
            <input
              {...props}
              type="date"
              value={fim}
              min={inicio || undefined}
              max={hoje}
              onChange={(event) => setFim(event.target.value)}
              disabled={travado}
              required
            />
          )}
        </Campo>
        <Campo rotulo="Unidade">
          {(props) =>
            unidadeUnica ? (
              <select {...props} value={unidadeUnica.id} disabled>
                <option value={unidadeUnica.id}>{unidadeUnica.nome}</option>
              </select>
            ) : (
              <select {...props} value={unidadeId} onChange={(event) => setUnidadeId(event.target.value)} disabled={travado}>
                <option value="">Todas as unidades</option>
                {unidades.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.nome}
                  </option>
                ))}
              </select>
            )
          }
        </Campo>
      </div>

      <Campo rotulo="Motivo (opcional)" erro={erroMotivo} ajuda="Fica registrado no histórico de solicitações.">
        {(props) => (
          <textarea
            {...props}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ex.: correção de batidas lançada no FriPonto"
            disabled={travado}
          />
        )}
      </Campo>

      {erro && (
        <p className="form-erro" role="alert">
          {erro}
        </p>
      )}

      {previaVencida && !erro && (
        <p className="integ-texto" role="status">
          Você mudou o período ou a unidade. Veja a prévia de novo antes de confirmar.
        </p>
      )}

      {previaValida && <Previa previa={previaValida} cota={status.cota} tempoReal={tempoReal} />}

      <div className="integ-botoes">
        <button
          type="button"
          className={previaValida ? 'integ-botao' : 'integ-botao integ-botao-primario'}
          onClick={verPrevia}
          disabled={travado || carregandoPrevia || enviando}
        >
          {carregandoPrevia ? 'Calculando...' : previaValida ? 'Atualizar prévia' : 'Ver prévia'}
        </button>
        <button
          type="submit"
          className="integ-botao integ-botao-primario"
          disabled={travado || !previaValida || previaValida.semanas.length === 0 || carregandoPrevia || enviando}
          title={previaValida ? undefined : 'Veja a prévia antes de confirmar'}
        >
          {enviando ? 'Enviando...' : tempoReal ? 'Confirmar e refazer' : 'Confirmar e puxar'}
        </button>
      </div>
    </form>
  )
}

interface PreviaProps {
  previa: PreviaDadosIntegracao
  cota: StatusIntegracao['cota']
  tempoReal: boolean
}

function Previa({ previa, cota, tempoReal }: PreviaProps) {
  const { semanas } = previa
  const novas = semanas.filter((semana) => semana.nova).length
  const dependentes = semanas.filter((semana) => semana.dependente).length
  const jaPublicadas = semanas.some((semana) => !semana.nova)
  const cotaEsgotada = cota.usadas_ultima_hora >= cota.limite_por_hora

  return (
    <div className="integ-previa" aria-live="polite">
      <h3>Prévia do pedido</h3>

      {semanas.length === 0 ? (
        <p className="integ-texto">
          {tempoReal
            ? 'Nenhum fechamento do mês neste período. Amplie as datas para incluir o dia do fechamento ou ajuste a unidade.'
            : 'Nenhuma semana para puxar neste período. Ajuste as datas ou a unidade.'}
        </p>
      ) : (
        <>
          <dl className="integ-totais">
            <div>
              <dt>{tempoReal ? 'Fechamentos do mês' : 'Semanas'}</dt>
              <dd>{semanas.length}</dd>
            </div>
            <div>
              <dt>{tempoReal ? 'Extrações na fila' : 'Fechamentos na fila'}</dt>
              <dd>{previa.fechamentos}</dd>
            </div>
            <div>
              <dt>Colaboradores</dt>
              <dd>≈ {previa.colaboradores_estimados.toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Chamadas ao FriPonto</dt>
              <dd>≈ {previa.chamadas_estimadas.toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Tempo estimado</dt>
              <dd>{formatarHoras(previa.horas_estimadas).replace('cerca de ', '≈ ')}</dd>
            </div>
          </dl>

          <p className="integ-texto">
            {tempoReal ? (
              <>
                {novas === 1 && <>1 fechamento do mês ainda não tinha sido feito e será criado. </>}
                {novas > 1 && <>{novas} fechamentos do mês ainda não tinham sido feitos e serão criados. </>}
              </>
            ) : (
              <>
                {novas === 1 && <>1 semana ainda não tinha sido puxada e será criada. </>}
                {novas > 1 && <>{novas} semanas ainda não tinham sido puxadas e serão criadas. </>}
              </>
            )}
            {previa.dependentes > 0 && (
              <>
                {tempoReal
                  ? 'Como cada fechamento do mês é calculado em cima do anterior, '
                  : 'Como cada semana é calculada em cima da anterior, '}
                <strong>{plural(previa.dependentes, 'fechamento já publicado', 'fechamentos já publicados')}</strong> depois do
                fim {previa.dependentes === 1 ? 'é refeito' : 'são refeitos'} junto para manter os saldos.{' '}
              </>
            )}
            Com o limite de <strong>{cota.limite_por_hora}</strong> chamadas por hora
            {cota.usadas_ultima_hora > 0 && <> ({cota.usadas_ultima_hora} já usadas na última hora)</>}, a extração leva{' '}
            <strong>{formatarHoras(previa.horas_estimadas)}</strong>.
            {cotaEsgotada && ' A cota da última hora está esgotada: a extração começa quando ela liberar.'}
            {tempoReal && ' A atualização ao vivo divide a mesma cota e fica mais lenta enquanto isso.'}
          </p>

          {previa.ignorados_em_processamento > 0 && (
            <p className="integ-texto">
              {plural(previa.ignorados_em_processamento, 'fechamento já está', 'fechamentos já estão')} em processamento e{' '}
              {previa.ignorados_em_processamento === 1 ? 'fica' : 'ficam'} de fora deste pedido.
            </p>
          )}

          <ul className="integ-semanas" aria-label={tempoReal ? 'Fechamentos do mês do pedido' : 'Semanas do pedido'}>
            {semanas.map((semana) => (
              <ItemSemana key={`${semana.data_referencia}-${semana.tipo}`} semana={semana} tempoReal={tempoReal} />
            ))}
          </ul>

          {jaPublicadas && (
            <Aviso>
              {tempoReal ? (
                <>
                  Esses fechamentos do mês saem do histórico até a nova extração terminar
                  {dependentes > 0 ? ', inclusive os refeitos junto' : ''}.
                </>
              ) : (
                <>
                  Os dados dessas semanas saem do painel até a nova extração terminar
                  {dependentes > 0 ? ', inclusive os das semanas refeitas junto' : ''}.
                </>
              )}
            </Aviso>
          )}
        </>
      )}
    </div>
  )
}

function ItemSemana({ semana, tempoReal }: { semana: SemanaPrevia; tempoReal: boolean }) {
  return (
    <li className={semana.dependente ? 'integ-semana integ-semana-dependente' : 'integ-semana'}>
      <span className="integ-semana-periodo">
        {tempoReal ? (
          <>
            Fechamento de {formatarData(semana.data_referencia)}
            <span> · período de {formatarData(semana.periodo_inicio)} a {formatarData(semana.data_referencia)}</span>
          </>
        ) : (
          <>
            {formatarData(semana.periodo_inicio)} a {formatarData(semana.data_referencia)}
            {semana.tipo === 'fechamento_mes' && <span> · fechamento do mês</span>}
          </>
        )}
      </span>
      <span className="integ-tags">
        {semana.nova && <span className="integ-tag integ-tag-nova">{tempoReal ? 'Novo' : 'Nova'}</span>}
        {semana.dependente && (
          <span className="integ-tag integ-tag-dependente">
            {tempoReal ? 'Refeito junto para manter os saldos' : 'Refeita junto para manter os saldos'}
          </span>
        )}
        {!semana.nova && !semana.dependente && <span className="integ-tag">{tempoReal ? 'Será refeito' : 'Será refeita'}</span>}
      </span>
    </li>
  )
}
