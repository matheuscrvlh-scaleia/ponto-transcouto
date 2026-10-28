import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { Aviso, Carregando, ErroCarregamento } from '../../components/Estados'
import {
  IconeAlerta,
  IconeAtividade,
  IconeBanco,
  IconeCadeado,
  IconeCalendario,
  IconeColunas,
  IconeMoeda,
  IconeRelogio,
  IconeSincronizar,
} from '../../components/Icones'
import { api } from '../../lib/api'
import { alertarFalha, alertarInfo, alertarSucesso } from '../../lib/alertas'
import { errosDeCampos } from '../../lib/erros'
import {
  entradaParaMinutos,
  formatarDataHora,
  formatarIntervalo,
  formatarMinutos,
  minutosParaEntrada,
} from '../../lib/formato'
import { avisarSincronizacaoPedida } from '../../lib/sincronizacao'
import { useRecurso } from '../../lib/useRecurso'
import type { Configuracoes as Config, ForcarSincronizacaoResposta, ModoExtracao } from '../../types/api'
import { PreviaCalendario } from './PreviaCalendario'
import { TituloPagina } from '../../components/TituloPagina'

/* As quatro telas usam GET/PATCH /configuracoes, cada uma com os seus campos:
   - 'alertas' (Configuração, RH e equipe): horas pagas e limites "fora da curva";
   - 'atualizacao' (Configuração, RH e equipe): modo semanal ou tempo real, dia e hora da extração semanal
     (no tempo real não há fotografia semanal, a não ser com dados passados congelados: só a hora da extração do
     fechamento do mês);
   - 'dados' (Configuração, RH e equipe): se o fechamento do mês puxa o mês de novo (congelar dados passados: só os dias novos);
   - 'calendario' (Administração, só equipe): fechamento do mês, cota e prévia da régua. */
export type SecaoConfiguracoes = 'alertas' | 'atualizacao' | 'dados' | 'calendario'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const CAMPOS_HORAS = [
  'teto_horas_pagas_minutos',
  'alerta_saldo_positivo_minutos',
  'alerta_saldo_negativo_minutos',
  'alerta_extra_dia_minutos',
  'alerta_negativa_dia_minutos',
] as const
// limites diários: zero desliga o alerta e não passam de um dia
const CAMPOS_DIA = new Set<string>(['alerta_extra_dia_minutos', 'alerta_negativa_dia_minutos'])
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
  dados: {
    titulo: 'Dados',
    carregando: 'Carregando configurações...',
    salvo: 'Configuração dos dados salva.',
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

const OPCOES_CONGELAR: { valor: boolean; titulo: string; descricao: string; Icone: typeof IconeCalendario }[] = [
  {
    valor: false,
    titulo: 'Atualizar dias já puxados',
    descricao:
      'Cada coleta puxa de novo o período inteiro, inclusive a do fechamento do mês: se o RH corrigir na FriPonto um dia que já estava no painel, a correção entra na coleta seguinte.',
    Icone: IconeSincronizar,
  },
  {
    valor: true,
    titulo: 'Congelar o mês no fechamento',
    descricao:
      'Durante o mês, cada coleta puxa de novo desde o último fechamento, e as correções do RH entram. No fechamento do mês, só os dias depois da última coleta são puxados e somados: o mês fecha como estava, mesmo que o RH zere as horas na FriPonto.',
    Icone: IconeCadeado,
  },
]

const ORIGENS: { valor: Config['origem_horas_pagas']; titulo: string; descricao: string; Icone: typeof IconeMoeda }[] = [
  {
    valor: 'teto',
    titulo: 'Teto definido aqui',
    descricao: 'As extras até o teto são pagas e o que passar vai para o banco de horas.',
    Icone: IconeMoeda,
  },
  {
    valor: 'coluna_secullum',
    titulo: 'Coluna da FriPonto',
    descricao: 'Usa o número de horas pagas que já vem calculado pela FriPonto (Secullum).',
    Icone: IconeColunas,
  },
]

/** "Com teto de 10:00 por semana, quem fizer 14:00 de extras recebe 10:00 pagas e 04:00 vão para o banco de horas." */
function exemploTeto(tetoMin: number, periodicidade: Config['teto_periodicidade']) {
  const por = periodicidade === 'semanal' ? 'por semana' : 'por mês'
  if (tetoMin === 0) return `Com teto zero, nenhuma extra é paga: todas vão para o banco de horas.`
  const extras = tetoMin + 4 * 60
  return `Exemplo: com teto de ${formatarMinutos(tetoMin)} ${por}, quem fizer ${formatarMinutos(extras)} de extras recebe ${formatarMinutos(
    tetoMin,
  )} pagas e ${formatarMinutos(extras - tetoMin)} vão para o banco de horas.`
}

/** "toda quarta-feira às 06:00" / "todo sábado às 06:00". */
function quandoExtrai(dia: number, hora: string) {
  const nome = (DIAS_SEMANA[dia] ?? '').toLowerCase()
  const artigo = dia === 0 || dia === 6 ? 'todo' : 'toda'
  return `${artigo} ${nome} às ${hora.slice(0, 5)}`
}

/* A coleta do mês fechado é guardada como "dias após o fechamento" (0 a 10) e mostrada como dia do mês:
   fechamento 25 + 1 = "Dia 26". Depois do dia 28 o dia muda conforme o mês, então aparece em dias. */
const DIAS_APOS_MAX = LIMITES_CALENDARIO.dias_apos_fechamento_mes[1]

function rotuloDiaColetaMes(diaFechamento: number, diasApos: number) {
  if (diasApos === 0) return `Dia ${diaFechamento} (o próprio dia do fechamento)`
  const dia = diaFechamento + diasApos
  return dia <= 28 ? `Dia ${dia}` : `${diasApos} dias após o dia ${diaFechamento}`
}

/** "todo dia 26" / "3 dias após o dia 27". */
function quandoColetaMes(diaFechamento: number, diasApos: number) {
  const dia = diaFechamento + diasApos
  return diasApos > 0 && dia <= 28 ? `todo dia ${dia}` : `${diasApos} dias após o dia ${diaFechamento}`
}

function nomeFuso(fuso: string) {
  return fuso === 'America/Sao_Paulo' ? 'Horário de Brasília.' : `Fuso ${fuso}.`
}

type Formulario = Record<(typeof CAMPOS_HORAS)[number] | (typeof CAMPOS_CALENDARIO)[number], string> & {
  teto_periodicidade: Config['teto_periodicidade']
  origem_horas_pagas: Config['origem_horas_pagas']
  modo_extracao: ModoExtracao
  congelar_dados_passados: boolean
  dia_semana_extracao: string
  hora_extracao: string
}

function paraFormulario(config: Config): Formulario {
  return {
    teto_horas_pagas_minutos: minutosParaEntrada(config.teto_horas_pagas_minutos),
    alerta_saldo_positivo_minutos: minutosParaEntrada(config.alerta_saldo_positivo_minutos),
    alerta_saldo_negativo_minutos: minutosParaEntrada(config.alerta_saldo_negativo_minutos),
    alerta_extra_dia_minutos: minutosParaEntrada(config.alerta_extra_dia_minutos),
    alerta_negativa_dia_minutos: minutosParaEntrada(config.alerta_negativa_dia_minutos),
    teto_periodicidade: config.teto_periodicidade,
    origem_horas_pagas: config.origem_horas_pagas,
    modo_extracao: config.modo_extracao,
    congelar_dados_passados: config.congelar_dados_passados,
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
      else if (CAMPOS_DIA.has(campo) && minutos > 24 * 60) erros[campo] = 'Um dia tem no máximo 24:00.'
      else if (campo !== 'teto_horas_pagas_minutos' && !CAMPOS_DIA.has(campo) && minutos < 1)
        erros[campo] = 'Informe um limite maior que zero.'
      else if (minutos !== original[campo]) alteracoes[campo] = minutos
    }
    if (form.teto_periodicidade !== original.teto_periodicidade) alteracoes.teto_periodicidade = form.teto_periodicidade
    if (form.origem_horas_pagas !== original.origem_horas_pagas) alteracoes.origem_horas_pagas = form.origem_horas_pagas
  } else if (secao === 'atualizacao') {
    if (form.modo_extracao !== original.modo_extracao) alteracoes.modo_extracao = form.modo_extracao
    // no tempo real não há extração semanal (só com dados passados congelados): o dia da semana fica escondido
    if (temFotografiaSemanal(form)) {
      const dia = Number(form.dia_semana_extracao)
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) erros.dia_semana_extracao = 'Escolha um dia da semana.'
      else if (dia !== original.dia_semana_extracao) alteracoes.dia_semana_extracao = dia
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.hora_extracao)) erros.hora_extracao = 'Use HH:MM.'
    else if (form.hora_extracao !== original.hora_extracao.slice(0, 5)) alteracoes.hora_extracao = form.hora_extracao
    const diasApos = Number(form.dias_apos_fechamento_mes)
    if (!Number.isInteger(diasApos) || diasApos < 0 || diasApos > DIAS_APOS_MAX)
      erros.dias_apos_fechamento_mes = 'Escolha um dia.'
    else if (diasApos !== original.dias_apos_fechamento_mes) alteracoes.dias_apos_fechamento_mes = diasApos
  } else if (secao === 'dados') {
    if (form.congelar_dados_passados !== original.congelar_dados_passados)
      alteracoes.congelar_dados_passados = form.congelar_dados_passados
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

/** Tempo real só mantém a fotografia semanal com dados passados congelados: é a base que o fechamento do mês soma. */
function temFotografiaSemanal(config: Pick<Config, 'modo_extracao' | 'congelar_dados_passados'>) {
  return config.modo_extracao === 'semanal' || config.congelar_dados_passados
}

/** Teto de horas pagas semanal: depende da fotografia semanal, então não combina com o tempo real. */
function usaTetoSemanal(config: Pick<Config, 'origem_horas_pagas' | 'teto_periodicidade'>) {
  return config.origem_horas_pagas === 'teto' && config.teto_periodicidade === 'semanal'
}

/** Regra de horas pagas: mudar recalcula o saldo de todo o histórico, não só dos próximos dados. */
function mudouRegraPagas(salva: Config, anterior: Config) {
  return (['origem_horas_pagas', 'teto_horas_pagas_minutos', 'teto_periodicidade'] as const).some(
    (campo) => salva[campo] !== anterior[campo],
  )
}

function mensagemSalvo(secao: SecaoConfiguracoes, salva: Config, anterior: Config) {
  if (secao === 'alertas' && mudouRegraPagas(salva, anterior))
    return 'Configurações salvas. A nova regra de horas pagas vale também para o histórico: o saldo de todos os fechamentos é recalculado em alguns minutos.'
  const descartadas =
    temFotografiaSemanal(anterior) && !temFotografiaSemanal(salva)
      ? ' As fotografias semanais que ainda não tinham começado foram descartadas.'
      : ''
  if (secao === 'dados') {
    const regra = salva.congelar_dados_passados
      ? 'Durante o mês as correções do RH entram; no fechamento, o mês congela como estava na última coleta.'
      : 'Cada coleta volta a puxar o período inteiro: correções na FriPonto entram na coleta seguinte.'
    return `Salvo. ${regra}${descartadas}`
  }
  if (secao !== 'atualizacao') return TEXTOS[secao].salvo
  const mes = quandoColetaMes(salva.dia_fechamento_mes, salva.dias_apos_fechamento_mes)
  if (salva.modo_extracao === 'tempo_real') {
    const semanal = temFotografiaSemanal(salva)
      ? `, a semana é fotografada ${quandoExtrai(salva.dia_semana_extracao, salva.hora_extracao)}`
      : ''
    return `Salvo. Tempo real ativo: os colaboradores são atualizados continuamente${semanal} e o fechamento do mês (dia ${salva.dia_fechamento_mes}) é gravado ${mes} às ${salva.hora_extracao.slice(0, 5)}.${descartadas}`
  }
  return `Salvo. Os dados serão atualizados ${quandoExtrai(salva.dia_semana_extracao, salva.hora_extracao)} e o mês fechado é puxado ${mes}.`
}

export function Configuracoes({ secao }: { secao: SecaoConfiguracoes }) {
  const { empresaId, query } = useEmpresaSelecionada()
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<Config>('/configuracoes', { signal, query }),
    `configuracoes-${empresaId}`,
  )
  const textos = TEXTOS[secao]

  useEffect(() => {
    document.title = `${textos.titulo} Copiloto de Ponto`
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

  /** Campo HH:MM; com `sinal`, o "−" ou "+" aparece fixo à esquerda (o valor é digitado sem ele). */
  const campoHoras = (campo: (typeof CAMPOS_HORAS)[number], rotulo: string, ajuda?: string, sinal?: '−' | '+') => (
    <Campo rotulo={rotulo} erro={erros[campo]} ajuda={ajuda}>
      {(props) => {
        const input = (
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
        )
        if (!sinal) return input
        return (
          <span className={sinal === '+' ? 'config-com-sinal positivo' : 'config-com-sinal negativo'}>
            <span className="config-sinal" aria-hidden="true">
              {sinal}
            </span>
            {input}
          </span>
        )
      }}
    </Campo>
  )

  // valores digitados agora (para o exemplo do teto e a régua da curva acompanharem a edição)
  const tetoMin = entradaParaMinutos(form.teto_horas_pagas_minutos)
  const positivoMin = entradaParaMinutos(form.alerta_saldo_positivo_minutos)
  const negativoMin = entradaParaMinutos(form.alerta_saldo_negativo_minutos)
  const tetoSemanalProibido = config.modo_extracao === 'tempo_real'

  const camposAlertas = (
    <>
      {config.recalculo_pendente && (
        <Aviso>
          Recalculando o saldo do histórico com a regra de horas pagas e o mapeamento de colunas atuais. Pode levar alguns
          minutos.
        </Aviso>
      )}
      <fieldset className="config-bloco">
        <legend className="sr-only">Horas pagas</legend>
        <div className="config-bloco-topo">
          <span className="config-bloco-icone" aria-hidden="true">
            <IconeMoeda tamanho={20} />
          </span>
          <div>
            <h2 className="config-bloco-titulo">Horas pagas</h2>
            <p className="config-bloco-sub">
              De onde vem o número de horas extras pagas de cada colaborador. A regra vale para todo o histórico: ao mudar,
              o saldo de todos os fechamentos é recalculado.
            </p>
          </div>
        </div>

        <div className="modo-opcoes" role="radiogroup" aria-label="Origem das horas pagas">
          {ORIGENS.map(({ valor, titulo, descricao, Icone }) => (
            <label key={valor} className={form.origem_horas_pagas === valor ? 'modo-opcao ativo' : 'modo-opcao'}>
              <input
                type="radio"
                name="origem_horas_pagas"
                value={valor}
                checked={form.origem_horas_pagas === valor}
                onChange={() => alterar('origem_horas_pagas', valor)}
              />
              <span className="modo-opcao-icone" aria-hidden="true">
                <Icone tamanho={20} />
              </span>
              <span className="modo-opcao-texto">
                <span className="modo-opcao-titulo">
                  {titulo}
                  {config.origem_horas_pagas === valor && <span className="modo-opcao-atual">Em uso</span>}
                </span>
                <span className="modo-opcao-desc">{descricao}</span>
              </span>
            </label>
          ))}
        </div>

        {form.origem_horas_pagas === 'teto' ? (
          <div className="config-teto">
            <div className="campos-grade">
              {campoHoras('teto_horas_pagas_minutos', 'Teto de horas pagas', 'Formato HH:MM. Zero = nenhuma extra é paga.')}
              <div className="field">
                <span className="config-rotulo" id="rotulo-periodicidade">
                  Vale por
                </span>
                <div className="config-segmentos" role="radiogroup" aria-labelledby="rotulo-periodicidade">
                  {(['semanal', 'mensal'] as const).map((valor) => {
                    const bloqueado = valor === 'semanal' && tetoSemanalProibido && form.teto_periodicidade !== 'semanal'
                    return (
                      <label
                        key={valor}
                        className={['config-segmento', form.teto_periodicidade === valor ? 'ativo' : '', bloqueado ? 'bloqueado' : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <input
                          type="radio"
                          name="teto_periodicidade"
                          value={valor}
                          checked={form.teto_periodicidade === valor}
                          disabled={bloqueado}
                          onChange={() => alterar('teto_periodicidade', valor)}
                        />
                        {valor === 'semanal' ? 'Semana' : 'Mês'}
                      </label>
                    )
                  })}
                </div>
                {tetoSemanalProibido && (
                  <span className="field-ajuda">No tempo real o teto é mensal: não há fotografia semanal.</span>
                )}
              </div>
            </div>
            {tetoMin !== null && (
              <p className="config-exemplo">
                <IconeBanco tamanho={18} />
                <span>{exemploTeto(tetoMin, form.teto_periodicidade)}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="config-exemplo">
            <IconeColunas tamanho={18} />
            <span>
              As horas pagas vêm prontas do cálculo da FriPonto, na coluna marcada como “pagas” no mapeamento de colunas. O
              teto não é usado.
            </span>
          </p>
        )}
      </fieldset>

      <fieldset className="config-bloco">
        <legend className="sr-only">Alertas fora da curva</legend>
        <div className="config-bloco-topo">
          <span className="config-bloco-icone" aria-hidden="true">
            <IconeAlerta tamanho={20} />
          </span>
          <div>
            <h2 className="config-bloco-titulo">Fora da curva</h2>
            <p className="config-bloco-sub">
              A partir de que saldo do banco de horas um colaborador ganha destaque no Dashboard e em Colaboradores.
            </p>
          </div>
        </div>

        <div className="curva-regua" aria-hidden="true">
          <span className="curva-faixa curva-neg">
            <strong>Abaixo do limite</strong>
            {negativoMin !== null ? `até −${formatarMinutos(negativoMin)}` : '—'}
          </span>
          <span className="curva-faixa curva-meio">
            <strong>Dentro da curva</strong>
            {negativoMin !== null && positivoMin !== null
              ? `−${formatarMinutos(negativoMin)} a +${formatarMinutos(positivoMin)}`
              : '—'}
          </span>
          <span className="curva-faixa curva-pos">
            <strong>Acima do limite</strong>
            {positivoMin !== null ? `a partir de +${formatarMinutos(positivoMin)}` : '—'}
          </span>
        </div>

        <div className="campos-grade">
          {campoHoras('alerta_saldo_negativo_minutos', 'Abaixo do limite a partir de', 'Devendo horas. Informe sem o sinal.', '−')}
          {campoHoras('alerta_saldo_positivo_minutos', 'Acima do limite a partir de', 'Horas sobrando no banco.', '+')}
        </div>
      </fieldset>

      <fieldset className="config-bloco">
        <legend className="sr-only">Limite diário</legend>
        <div className="config-bloco-topo">
          <span className="config-bloco-icone" aria-hidden="true">
            <IconeRelogio tamanho={20} />
          </span>
          <div>
            <h2 className="config-bloco-titulo">Limite diário</h2>
            <p className="config-bloco-sub">
              Alerta por colaborador quando, num mesmo dia, ele passar de tantas horas extras ou de tantas horas
              negativas. Aparece em Colaboradores, com os dias marcados.
            </p>
          </div>
        </div>

        <div className="campos-grade">
          {campoHoras('alerta_extra_dia_minutos', 'Extras no dia acima de', 'Formato HH:MM. 00:00 = sem alerta.', '+')}
          {campoHoras(
            'alerta_negativa_dia_minutos',
            'Negativas no dia acima de',
            'Faltas e atrasos. 00:00 = sem alerta.',
            '−',
          )}
        </div>
        {(() => {
          const extraDia = entradaParaMinutos(form.alerta_extra_dia_minutos)
          const negativaDia = entradaParaMinutos(form.alerta_negativa_dia_minutos)
          const partes = [
            extraDia ? `mais de ${formatarMinutos(extraDia)} extras` : null,
            negativaDia ? `mais de ${formatarMinutos(negativaDia)} negativas` : null,
          ].filter(Boolean)
          return (
            <p className="config-exemplo">
              <IconeAlerta tamanho={18} />
              <span>
                {partes.length
                  ? `Exemplo: o colaborador que fizer ${partes.join(' ou ')} num dia é alertado, com os dias em que isso aconteceu.`
                  : 'Sem limite diário: nenhum dia é alertado.'}
              </span>
            </p>
          )
        })()}
      </fieldset>
    </>
  )

  const tempoReal = form.modo_extracao === 'tempo_real'
  const semanal = temFotografiaSemanal(form)
  const perdeSemanal = temFotografiaSemanal(config) && !semanal
  const ligandoCongelar = form.congelar_dados_passados && !config.congelar_dados_passados
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
                    O teto de horas pagas está semanal, e ele depende da fotografia semanal. Antes de ativar o tempo
                    real, mude a periodicidade do teto para mensal em{' '}
                    <Link to="/configuracao/alertas">Alertas e horas pagas</Link>.
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {perdeSemanal && (
          <Aviso>
            Ao salvar, as fotografias semanais que ainda não começaram são descartadas. As já publicadas continuam no
            histórico, e daqui em diante o histórico de cada colaborador passa a ser por dia.
          </Aviso>
        )}
      </fieldset>

      <fieldset className="form-secao">
        <legend>{semanal ? 'Dias e hora da atualização' : 'Fechamento do mês'}</legend>
        <p className="form-nota">
          {tempoReal && semanal
            ? <>
                Os números são atualizados continuamente e, toda semana no dia escolhido, a semana é fotografada (o mês
                congela no fechamento, em <Link to="/configuracao/dados">Configurações → Dados</Link>).
                O fechamento do mês (dia {config.dia_fechamento_mes}) é gravado no dia do mês escolhido abaixo.
              </>
            : tempoReal
            ? `Sem fotografia semanal: os números são atualizados continuamente e o histórico passa a ser por dia. O fechamento do mês (dia ${config.dia_fechamento_mes}) continua sendo gravado como registro oficial, no dia do mês escolhido abaixo.`
            : `Toda semana, no dia escolhido, os dados são puxados da FriPonto e publicados no painel. E uma vez por mês, no dia do mês escolhido, é puxado o mês fechado (até o dia ${config.dia_fechamento_mes}). Deixe tempo para o RH ajustar o ponto antes.`}
        </p>
        <div className="campos-grade">
          {semanal && (
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
            rotulo="Dia do mês"
            erro={erros.dias_apos_fechamento_mes}
            ajuda={`Coleta do mês fechado no dia ${config.dia_fechamento_mes}.`}
          >
            {(props) => (
              <select
                {...props}
                value={form.dias_apos_fechamento_mes}
                onChange={(event) => alterar('dias_apos_fechamento_mes', event.target.value)}
              >
                {Array.from({ length: DIAS_APOS_MAX + 1 }, (_, diasApos) => (
                  <option key={diasApos} value={diasApos}>
                    {rotuloDiaColetaMes(config.dia_fechamento_mes, diasApos)}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo
            rotulo={semanal ? 'Hora' : 'Horário da extração do fechamento do mês'}
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
                  Cada colaborador é atualizado a cada{' '}
                  <strong>~{formatarIntervalo(estimativa.minutos_por_rodada)}</strong> ({estimativa.colaboradores}{' '}
                  {estimativa.colaboradores === 1 ? 'colaborador' : 'colaboradores'}, cota da FriPonto).
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

  const camposDados = (
    <fieldset className="config-bloco">
      <legend className="sr-only">Dias já puxados</legend>
      <div className="config-bloco-topo">
        <span className="config-bloco-icone" aria-hidden="true">
          <IconeCadeado tamanho={20} />
        </span>
        <div>
          <h2 className="config-bloco-titulo">Dias já puxados</h2>
          <p className="config-bloco-sub">
            O que acontece com os dias que já estão no painel quando alguém altera o ponto na FriPonto depois. Para puxar
            de novo um mês já fechado, use{' '}
            <Link to="/configuracao/integracao">Integração FriPonto → Puxar dados</Link>.
          </p>
        </div>
      </div>

      <div className="modo-opcoes" role="radiogroup" aria-label="Dias já puxados">
        {OPCOES_CONGELAR.map(({ valor, titulo, descricao, Icone }) => (
          <label key={String(valor)} className={form.congelar_dados_passados === valor ? 'modo-opcao ativo' : 'modo-opcao'}>
            <input
              type="radio"
              name="congelar_dados_passados"
              checked={form.congelar_dados_passados === valor}
              onChange={() => alterar('congelar_dados_passados', valor)}
            />
            <span className="modo-opcao-icone" aria-hidden="true">
              <Icone tamanho={20} />
            </span>
            <span className="modo-opcao-texto">
              <span className="modo-opcao-titulo">
                {titulo}
                {config.congelar_dados_passados === valor && <span className="modo-opcao-atual">Em uso</span>}
              </span>
              <span className="modo-opcao-desc">{descricao}</span>
            </span>
          </label>
        ))}
      </div>
      {ligandoCongelar && (
        <Aviso>
          Vale a partir da próxima coleta: ela puxa só os dias depois da última fotografia publicada de cada colaborador.
          O que já está no painel fica como está.
          {tempoReal && ' No tempo real, a fotografia semanal volta a ser feita, porque é ela que congela a semana.'}
        </Aviso>
      )}
      {perdeSemanal && (
        <Aviso>
          No tempo real, sem dados congelados, não há fotografia semanal: ao salvar, as fotografias semanais que ainda não
          começaram são descartadas.
        </Aviso>
      )}
    </fieldset>
  )

  const camposCalendario = (
    <fieldset className="form-secao">
      <legend>Régua de extração</legend>
      <p className="form-nota">
        O modo de atualização (semanal ou tempo real), o dia da semana, o dia do mês e a hora da extração ficam em{' '}
        <Link to="/configuracao/atualizacao">Configuração → Atualização dos dados</Link>. Hoje:{' '}
        {config.modo_extracao === 'tempo_real'
          ? `tempo real, sem fotografia semanal (só o fechamento do mês, extraído às ${config.hora_extracao.slice(0, 5)})`
          : `semanal, com extração ${quandoExtrai(config.dia_semana_extracao, config.hora_extracao)}`}
        {`, e o mês fechado é puxado ${quandoColetaMes(config.dia_fechamento_mes, config.dias_apos_fechamento_mes)}`}.
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

  const campos = { alertas: camposAlertas, atualizacao: camposAtualizacao, dados: camposDados, calendario: camposCalendario }[
    secao
  ]

  return (
    <section className="pagina">
      <TituloPagina>{textos.titulo}</TituloPagina>

      {/* Alertas e Dados: cada assunto num bloco próprio; as outras seções seguem num cartão só */}
      <form className={secao === 'alertas' || secao === 'dados' ? 'config-form' : 'card'} onSubmit={salvar} noValidate>
        {campos}

        {/* fica grudada no rodapé da tela enquanto houver alteração por salvar */}
        <div className={alterado ? 'config-rodape alterado' : 'config-rodape'}>
          <span className="config-rodape-texto" role="status">
            {alterado ? 'Alterações não salvas' : 'Tudo salvo'}
          </span>
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
                Descartar
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
