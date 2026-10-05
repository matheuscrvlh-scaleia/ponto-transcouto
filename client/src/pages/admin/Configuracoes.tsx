import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { Aviso, Carregando, ErroCarregamento } from '../../components/Estados'
import { IconeAtividade, IconeCalendario, IconeRelogio, IconeSincronizar } from '../../components/Icones'
import { api } from '../../lib/api'
import { alertarFalha, alertarInfo, alertarSucesso } from '../../lib/alertas'
import { errosDeCampos } from '../../lib/erros'
import { entradaParaMinutos, formatarDataHora, formatarIntervalo, minutosParaEntrada } from '../../lib/formato'
import { avisarSincronizacaoPedida } from '../../lib/sincronizacao'
import { useRecurso } from '../../lib/useRecurso'
import type { Configuracoes as Config, ForcarSincronizacaoResposta, ModoExtracao } from '../../types/api'
import { PreviaCalendario } from './PreviaCalendario'
import { TituloPagina } from '../../components/TituloPagina'

/* As três telas usam GET/PATCH /configuracoes, cada uma com os seus campos:
   - 'alertas' (Configuração, RH e equipe): horas pagas e limites "fora da curva";
   - 'atualizacao' (Configuração, RH e equipe): modo semanal ou tempo real, dia e hora da extração semanal
     (no tempo real não há fotografia semanal: só a hora da extração do fechamento do mês);
   - 'calendario' (Administração, só equipe): fechamento do mês, cota e prévia da régua. */
export type SecaoConfiguracoes = 'alertas' | 'atualizacao' | 'calendario'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const CAMPOS_HORAS = ['teto_horas_pagas_minutos', 'alerta_saldo_positivo_minutos', 'alerta_saldo_negativo_minutos'] as const
const CAMPOS_CALENDARIO = ['dia_fechamento_mes', 'dias_apos_fechamento_mes', 'cota_calcular_por_hora'] as const

const LIMITES_CALENDARIO: Record<(typeof CAMPOS_CALENDARIO)[number], [number, number]> = {
  dia_fechamento_mes: [1, 28],
  dias_apos_fechamento_mes: [0, 10],
  cota_calcular_por_hora: [1, 100],
}

const TEXTOS: Record<SecaoConfiguracoes, { titulo: string; carregando: string; salvo: string; botao: string }> = {
  alertas: {
    titulo: 'Alertas e horas pagas',
    carregando: 'Carregando configurações...',
    salvo: 'Configurações salvas. Valem a partir da próxima atualização dos dados.',
    botao: 'Salvar configurações',
  },
  atualizacao: {
    titulo: 'Atualização dos dados',
    carregando: 'Carregando configurações...',
    salvo: 'Atualização dos dados salva.',
    botao: 'Salvar',
  },
  calendario: {
    titulo: 'Calendário de extração',
    carregando: 'Carregando calendário...',
    salvo: 'Régua de extração salva. A prévia abaixo já considera as novas datas.',
    botao: 'Salvar régua',
  },
}

const MODOS: { valor: ModoExtracao; titulo: string; descricao: string; Icone: typeof IconeCalendario }[] = [
  {
    valor: 'semanal',
    titulo: 'Semanal',
    descricao:
      'Os dados são puxados da FriPonto uma vez por semana, no dia e hora escolhidos, e viram uma fotografia publicada no painel.',
    Icone: IconeCalendario,
  },
  {
    valor: 'tempo_real',
    titulo: 'Tempo real',
    descricao:
      'Sem fotografia semanal: o sistema atualiza o período atual até hoje, colaborador por colaborador, o tempo todo, e o histórico passa a ser por dia. Só o fechamento do mês continua sendo gravado como registro oficial.',
    Icone: IconeAtividade,
  },
]

/** "toda quarta-feira às 06:00" / "todo sábado às 06:00". */
function quandoExtrai(dia: number, hora: string) {
  const nome = (DIAS_SEMANA[dia] ?? '').toLowerCase()
  const artigo = dia === 0 || dia === 6 ? 'todo' : 'toda'
  return `${artigo} ${nome} às ${hora.slice(0, 5)}`
}

function nomeFuso(fuso: string) {
  return fuso === 'America/Sao_Paulo' ? 'Horário de Brasília.' : `Fuso ${fuso}.`
}

type Formulario = Record<(typeof CAMPOS_HORAS)[number] | (typeof CAMPOS_CALENDARIO)[number], string> & {
  teto_periodicidade: Config['teto_periodicidade']
  origem_horas_pagas: Config['origem_horas_pagas']
  modo_extracao: ModoExtracao
  dia_semana_extracao: string
  hora_extracao: string
}

function paraFormulario(config: Config): Formulario {
  return {
    teto_horas_pagas_minutos: minutosParaEntrada(config.teto_horas_pagas_minutos),
    alerta_saldo_positivo_minutos: minutosParaEntrada(config.alerta_saldo_positivo_minutos),
    alerta_saldo_negativo_minutos: minutosParaEntrada(config.alerta_saldo_negativo_minutos),
    teto_periodicidade: config.teto_periodicidade,
    origem_horas_pagas: config.origem_horas_pagas,
    modo_extracao: config.modo_extracao,
    dia_semana_extracao: String(config.dia_semana_extracao),
    hora_extracao: config.hora_extracao.slice(0, 5),
    dia_fechamento_mes: String(config.dia_fechamento_mes),
    dias_apos_fechamento_mes: String(config.dias_apos_fechamento_mes),
    cota_calcular_por_hora: String(config.cota_calcular_por_hora),
  }
}

type Alteracoes = Partial<
  Omit<Config, 'empresa_id' | 'fuso_horario' | 'atualizado_em' | 'atualizado_por' | 'tempo_real_estimativa'>
>

/** Valida só os campos da seção, para que uma tela nunca envie campos da outra. */
function validar(form: Formulario, original: Config, secao: SecaoConfiguracoes) {
  const erros: Record<string, string> = {}
  const alteracoes: Record<string, unknown> = {}

  if (secao === 'alertas') {
    for (const campo of CAMPOS_HORAS) {
      const minutos = entradaParaMinutos(form[campo])
      if (minutos === null || minutos > 999 * 60 + 59) erros[campo] = 'Use o formato HH:MM (ex.: 10:30).'
      else if (campo !== 'teto_horas_pagas_minutos' && minutos < 1) erros[campo] = 'Informe um limite maior que zero.'
      else if (minutos !== original[campo]) alteracoes[campo] = minutos
    }
    if (form.teto_periodicidade !== original.teto_periodicidade) alteracoes.teto_periodicidade = form.teto_periodicidade
    if (form.origem_horas_pagas !== original.origem_horas_pagas) alteracoes.origem_horas_pagas = form.origem_horas_pagas
  } else if (secao === 'atualizacao') {
    if (form.modo_extracao !== original.modo_extracao) alteracoes.modo_extracao = form.modo_extracao
    // no tempo real não há extração semanal: o dia da semana fica escondido e não é enviado
    if (form.modo_extracao === 'semanal') {
      const dia = Number(form.dia_semana_extracao)
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) erros.dia_semana_extracao = 'Escolha um dia da semana.'
      else if (dia !== original.dia_semana_extracao) alteracoes.dia_semana_extracao = dia
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.hora_extracao)) erros.hora_extracao = 'Use HH:MM.'
    else if (form.hora_extracao !== original.hora_extracao.slice(0, 5)) alteracoes.hora_extracao = form.hora_extracao
  } else {
    for (const campo of CAMPOS_CALENDARIO) {
      const valor = Number(form[campo])
      const [min, max] = LIMITES_CALENDARIO[campo]
      if (!Number.isInteger(valor) || valor < min || valor > max) erros[campo] = `Informe um número entre ${min} e ${max}.`
      else if (valor !== original[campo]) alteracoes[campo] = valor
    }
  }

  return { erros, alteracoes: alteracoes as Alteracoes }
}

/** Teto de horas pagas semanal: depende da fotografia semanal, então não combina com o tempo real. */
function usaTetoSemanal(config: Pick<Config, 'origem_horas_pagas' | 'teto_periodicidade'>) {
  return config.origem_horas_pagas === 'teto' && config.teto_periodicidade === 'semanal'
}

function mensagemSalvo(secao: SecaoConfiguracoes, salva: Config, anterior: Config) {
  if (secao !== 'atualizacao') return TEXTOS[secao].salvo
  if (salva.modo_extracao === 'tempo_real') {
    const descartadas =
      anterior.modo_extracao !== 'tempo_real' ? ' As fotografias semanais que ainda não tinham começado foram descartadas.' : ''
    return `Salvo. Tempo real ativo: os colaboradores são atualizados continuamente e o fechamento do mês (dia ${salva.dia_fechamento_mes}) é gravado às ${salva.hora_extracao.slice(0, 5)}.${descartadas}`
  }
  return `Salvo. Os dados serão atualizados ${quandoExtrai(salva.dia_semana_extracao, salva.hora_extracao)}.`
}

export function Configuracoes({ secao }: { secao: SecaoConfiguracoes }) {
  const { empresaId, query } = useEmpresaSelecionada()
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<Config>('/configuracoes', { signal, query }),
    `configuracoes-${empresaId}`,
  )
  const textos = TEXTOS[secao]

  useEffect(() => {
    document.title = `${textos.titulo} — Copiloto de Ponto`
  }, [textos.titulo])

  if (carregando) return <Carregando texto={textos.carregando} />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  return <FormConfiguracoes key={`${secao}-${dados.atualizado_em}`} inicial={dados} secao={secao} query={query} />
}

interface FormProps {
  inicial: Config
  secao: SecaoConfiguracoes
  query: { empresa_id?: number }
}

function FormConfiguracoes({ inicial, secao, query }: FormProps) {
  const [config, setConfig] = useState(inicial)
  const [form, setForm] = useState(() => paraFormulario(inicial))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  // "Forçar sincronização" (Atualização dos dados): o modal fica fora do <form>
  const [sincronizando, setSincronizando] = useState(false)
  const textos = TEXTOS[secao]

  const { alteracoes } = validar(form, config, secao)
  const alterado = Object.keys(alteracoes).length > 0

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const resultado = validar(form, config, secao)
    setErros(resultado.erros)
    if (Object.keys(resultado.erros).length) return
    if (!Object.keys(resultado.alteracoes).length) return alertarInfo('Nada para salvar.')

    setEnviando(true)
    try {
      const salva = await api<Config>('/configuracoes', { method: 'PATCH', query, json: resultado.alteracoes })
      setConfig(salva)
      setForm(paraFormulario(salva))
      alertarSucesso(mensagemSalvo(secao, salva, config))
    } catch (e) {
      setErros(errosDeCampos(e))
      alertarFalha(e)
    } finally {
      setEnviando(false)
    }
  }

  const reguaAlterada = ['dia_semana_extracao', 'hora_extracao', 'dia_fechamento_mes', 'dias_apos_fechamento_mes']
    .map((campo) => String(config[campo as keyof Config]))
    .join('|')

  const campoHoras = (campo: (typeof CAMPOS_HORAS)[number], rotulo: string, ajuda?: string) => (
    <Campo rotulo={rotulo} erro={erros[campo]} ajuda={ajuda}>
      {(props) => (
        <input
          {...props}
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          value={form[campo]}
          onChange={(event) => alterar(campo, event.target.value)}
          onBlur={() => {
            const minutos = entradaParaMinutos(form[campo])
            if (minutos !== null) alterar(campo, minutosParaEntrada(minutos))
          }}
        />
      )}
    </Campo>
  )

  const camposAlertas = (
    <>
      <fieldset className="form-secao">
        <legend>Horas pagas</legend>
        <div className="campos-grade">
          <Campo rotulo="Origem das horas pagas" erro={erros.origem_horas_pagas}>
            {(props) => (
              <select
                {...props}
                value={form.origem_horas_pagas}
                onChange={(event) => alterar('origem_horas_pagas', event.target.value as Formulario['origem_horas_pagas'])}
              >
                <option value="teto">Teto configurado aqui</option>
                <option value="coluna_secullum">Coluna do cálculo da Secullum</option>
              </select>
            )}
          </Campo>
          {campoHoras(
            'teto_horas_pagas_minutos',
            'Teto de horas pagas',
            form.origem_horas_pagas === 'teto'
              ? 'Extras até o teto são pagas; o excedente vai para o banco.'
              : 'Não usado enquanto a origem for a coluna da Secullum.',
          )}
          <Campo
            rotulo="Periodicidade do teto"
            erro={erros.teto_periodicidade}
            ajuda={
              config.modo_extracao === 'tempo_real'
                ? 'No tempo real o teto é mensal: não há fotografia semanal.'
                : undefined
            }
          >
            {(props) => (
              <select
                {...props}
                value={form.teto_periodicidade}
                onChange={(event) => alterar('teto_periodicidade', event.target.value as Formulario['teto_periodicidade'])}
              >
                <option value="semanal" disabled={config.modo_extracao === 'tempo_real' && form.teto_periodicidade !== 'semanal'}>
                  Semanal
                </option>
                <option value="mensal">Mensal</option>
              </select>
            )}
          </Campo>
        </div>
      </fieldset>

      <fieldset className="form-secao">
        <legend>Alertas “fora da curva”</legend>
        <div className="campos-grade">
          {campoHoras('alerta_saldo_positivo_minutos', 'Saldo positivo a partir de', 'Colaborador aparece como “acima do limite”.')}
          {campoHoras('alerta_saldo_negativo_minutos', 'Saldo negativo a partir de', 'Informe sem sinal; ex.: 10:00 = −10:00.')}
        </div>
      </fieldset>
    </>
  )

  const tempoReal = form.modo_extracao === 'tempo_real'
  const mudandoParaTempoReal = tempoReal && config.modo_extracao !== 'tempo_real'
  // o server recusa tempo real com teto semanal (400): avisa antes, no próprio cartão
  const tetoSemanalBloqueia = config.modo_extracao !== 'tempo_real' && usaTetoSemanal(config)
  const estimativa = config.tempo_real_estimativa ?? { colaboradores: 0, minutos_por_rodada: null }

  const camposAtualizacao = (
    <>
      <fieldset className="form-secao">
        <legend className="sr-only">Como os dados são atualizados</legend>
        <div className="form-secao-topo">
          <span className="form-secao-titulo" aria-hidden="true">
            Como os dados são atualizados
          </span>
          <button type="button" className="btn-secondary btn-sincronizar" onClick={() => setSincronizando(true)}>
            <IconeSincronizar tamanho={16} />
            Forçar sincronização
          </button>
        </div>
        <div className="modo-opcoes">
          {MODOS.map(({ valor, titulo, descricao, Icone }) => (
            <label key={valor} className={form.modo_extracao === valor ? 'modo-opcao ativo' : 'modo-opcao'}>
              <input
                type="radio"
                name="modo_extracao"
                value={valor}
                checked={form.modo_extracao === valor}
                onChange={() => alterar('modo_extracao', valor)}
              />
              <span className="modo-opcao-icone" aria-hidden="true">
                <Icone tamanho={20} />
              </span>
              <span className="modo-opcao-texto">
                <span className="modo-opcao-titulo">
                  {titulo}
                  {config.modo_extracao === valor && <span className="modo-opcao-atual">Em uso</span>}
                </span>
                <span className="modo-opcao-desc">{descricao}</span>
                {valor === 'tempo_real' && tetoSemanalBloqueia && (
                  <span className="modo-opcao-alerta">
                    O teto de horas pagas está semanal, e ele depende da fotografia semanal. Antes de ativar o tempo real, mude
                    a periodicidade do teto para mensal em <Link to="/configuracao/alertas">Alertas e horas pagas</Link>.
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {mudandoParaTempoReal && (
          <Aviso>
            Ao salvar, as fotografias semanais que ainda não começaram são descartadas. As já publicadas continuam no
            histórico, e daqui em diante o histórico de cada colaborador passa a ser por dia.
          </Aviso>
        )}
      </fieldset>

      <fieldset className="form-secao">
        <legend>{tempoReal ? 'Fechamento do mês' : 'Dia e hora da atualização'}</legend>
        <p className="form-nota">
          {tempoReal
            ? `Sem fotografia semanal: os números são atualizados continuamente e o histórico passa a ser por dia. O fechamento do mês (dia ${config.dia_fechamento_mes}) continua sendo gravado como registro oficial.`
            : 'Neste dia e hora os dados são puxados da FriPonto e publicados no painel. Deixe tempo para o RH ajustar o ponto antes.'}
        </p>
        <div className="campos-grade">
          {!tempoReal && (
            <Campo rotulo="Dia da semana" erro={erros.dia_semana_extracao}>
              {(props) => (
                <select {...props} value={form.dia_semana_extracao} onChange={(event) => alterar('dia_semana_extracao', event.target.value)}>
                  {DIAS_SEMANA.map((dia, indice) => (
                    <option key={dia} value={indice}>
                      {dia}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          )}
          <Campo
            rotulo={tempoReal ? 'Horário da extração do fechamento do mês' : 'Hora'}
            erro={erros.hora_extracao}
            ajuda={nomeFuso(config.fuso_horario)}
          >
            {(props) => (
              <input {...props} type="time" value={form.hora_extracao} onChange={(event) => alterar('hora_extracao', event.target.value)} />
            )}
          </Campo>
        </div>
      </fieldset>

      {tempoReal && (
        <fieldset className="form-secao">
          <legend>Ritmo do tempo real</legend>
          <p className="modo-estimativa">
            <IconeRelogio tamanho={18} />
            <span>
              {estimativa.minutos_por_rodada != null ? (
                <>
                  Cada colaborador é atualizado a cada <strong>~{formatarIntervalo(estimativa.minutos_por_rodada)}</strong> (
                  {estimativa.colaboradores} {estimativa.colaboradores === 1 ? 'colaborador' : 'colaboradores'}, cota da
                  FriPonto).
                </>
              ) : (
                'Ainda não há colaboradores cadastrados para estimar de quanto em quanto tempo cada um é atualizado.'
              )}
            </span>
          </p>
          <Aviso>
            No tempo real, a cota de consultas da FriPonto fica sempre em uso. Os pedidos manuais em Integração FriPonto
            (refazer o fechamento do mês, atualizar todos agora) dividem a mesma cota e podem levar mais tempo para terminar.
          </Aviso>
        </fieldset>
      )}
    </>
  )

  const camposCalendario = (
    <fieldset className="form-secao">
      <legend>Régua de extração</legend>
      <p className="form-nota">
        O modo de atualização (semanal ou tempo real) e o dia e a hora da extração ficam em{' '}
        <Link to="/configuracao/atualizacao">Configuração → Atualização dos dados</Link>. Hoje:{' '}
        {config.modo_extracao === 'tempo_real'
          ? `tempo real, sem fotografia semanal (só o fechamento do mês, extraído às ${config.hora_extracao.slice(0, 5)})`
          : `semanal, com extração ${quandoExtrai(config.dia_semana_extracao, config.hora_extracao)}`}
        .
      </p>
      <div className="campos-grade">
        <Campo rotulo="Fuso horário" ajuda="Usado para o dia e a hora da extração.">
          {(props) => <input {...props} type="text" value={config.fuso_horario} readOnly />}
        </Campo>
        <Campo rotulo="Dia do fechamento do mês" erro={erros.dia_fechamento_mes} ajuda="Entre 1 e 28.">
          {(props) => (
            <input
              {...props}
              type="number"
              min={1}
              max={28}
              value={form.dia_fechamento_mes}
              onChange={(event) => alterar('dia_fechamento_mes', event.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Dias após o fechamento" erro={erros.dias_apos_fechamento_mes} ajuda="Espera extra para o RH ajustar o ponto.">
          {(props) => (
            <input
              {...props}
              type="number"
              min={0}
              max={10}
              value={form.dias_apos_fechamento_mes}
              onChange={(event) => alterar('dias_apos_fechamento_mes', event.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Cota de cálculos por hora" erro={erros.cota_calcular_por_hora} ajuda="Limite da Secullum: 100/h por banco.">
          {(props) => (
            <input
              {...props}
              type="number"
              min={1}
              max={100}
              value={form.cota_calcular_por_hora}
              onChange={(event) => alterar('cota_calcular_por_hora', event.target.value)}
            />
          )}
        </Campo>
      </div>
    </fieldset>
  )

  const campos = { alertas: camposAlertas, atualizacao: camposAtualizacao, calendario: camposCalendario }[secao]

  return (
    <section className="pagina">
      <header className="pagina-header">
        <TituloPagina>{textos.titulo}</TituloPagina>
        <p className="pagina-sub">
          Última alteração
          {config.atualizado_por ? ` por ${config.atualizado_por.nome}` : ''} em {formatarDataHora(config.atualizado_em)}.
        </p>
      </header>

      <form className="card" onSubmit={salvar} noValidate>
        {campos}

        <div className="form-secao">
          <div className="form-acoes">
            {alterado && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setForm(paraFormulario(config))
                  setErros({})
                }}
              >
                Descartar alterações
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={enviando || !alterado}>
              {enviando ? 'Salvando...' : textos.botao}
            </button>
          </div>
        </div>
      </form>

      {sincronizando && (
        <ModalForcarSincronizacao
          query={query}
          tempoReal={config.modo_extracao === 'tempo_real'}
          onFechar={() => setSincronizando(false)}
          onPedido={(texto) => {
            setSincronizando(false)
            alertarSucesso(texto, 'Sincronização solicitada')
          }}
        />
      )}
      {secao === 'calendario' && <PreviaCalendario versao={reguaAlterada} podeAjustar />}
    </section>
  )
}

/* ---------- Forçar sincronização (Atualização dos dados) ---------- */

function textoSincronizacao(resposta: ForcarSincronizacaoResposta) {
  const cadastros = resposta.cadastros.ja_pendente
    ? `A sincronização de cadastros já estava na fila (pedida em ${formatarDataHora(resposta.cadastros.solicitado_em)}).`
    : `Sincronização pedida em ${formatarDataHora(resposta.cadastros.solicitado_em)}.`
  const tempoReal = resposta.tempo_real
    ? ` Depois dos cadastros e das batidas, ${resposta.tempo_real.colaboradores} ${
        resposta.tempo_real.colaboradores === 1 ? 'colaborador passa' : 'colaboradores passam'
      } para o início da fila do tempo real${
        resposta.tempo_real.minutos_estimados != null
          ? ` (todos atualizados em ~${formatarIntervalo(resposta.tempo_real.minutos_estimados)})`
          : ''
      }.`
    : ''
  return `${cadastros} O serviço de extração começa em até 1 minuto.${tempoReal}`
}

function ModalForcarSincronizacao({
  query,
  tempoReal,
  onFechar,
  onPedido,
}: {
  query: { empresa_id?: number }
  tempoReal: boolean
  onFechar: () => void
  onPedido: (texto: string) => void
}) {
  return (
    <ModalConfirmacao
      titulo="Forçar sincronização"
      rotuloConfirmar="Sincronizar agora"
      motivo="opcional"
      onFechar={onFechar}
      onConfirmar={async (motivo) => {
        const resposta = await api<ForcarSincronizacaoResposta>('/integracao/sincronizar', {
          method: 'POST',
          query,
          json: { motivo },
        })
        avisarSincronizacaoPedida()
        onPedido(textoSincronizacao(resposta))
      }}
    >
      <p>Busca agora na FriPonto, sem esperar o próximo horário:</p>
      <ul className="forcar-sincronizacao-lista">
        <li>cadastros: unidades e colaboradores novos ou transferidos;</li>
        <li>batidas de ponto;</li>
        {tempoReal ? (
          <li>horas de todos os colaboradores no tempo real, respeitando a cota de consultas da FriPonto.</li>
        ) : (
          <li>
            as horas publicadas não mudam. Para refazer uma semana, use{' '}
            <Link to="/configuracao/integracao" onClick={onFechar}>
              Integração FriPonto → Puxar dados
            </Link>
            .
          </li>
        )}
      </ul>
      <p>Enquanto estiver sincronizando, um aviãozinho aparece no canto da tela. O pedido fica no histórico da Integração.</p>
    </ModalConfirmacao>
  )
}
