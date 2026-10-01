import { useEffect, useState, type FormEvent } from 'react'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Campo } from '../../components/Campo'
import { Carregando, ErroCarregamento } from '../../components/Estados'
import { api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { entradaParaMinutos, formatarDataHora, minutosParaEntrada } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { Configuracoes as Config } from '../../types/api'
import { PreviaCalendario } from './PreviaCalendario'

/* As duas telas usam GET/PATCH /configuracoes, cada uma com os seus campos:
   - 'alertas' (Configuração, RH e equipe): horas pagas e limites "fora da curva";
   - 'calendario' (Administração, só equipe): régua de extração e cota. */
export type SecaoConfiguracoes = 'alertas' | 'calendario'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const CAMPOS_HORAS = ['teto_horas_pagas_minutos', 'alerta_saldo_positivo_minutos', 'alerta_saldo_negativo_minutos'] as const
const CAMPOS_NUMERICOS = ['dia_semana_extracao', 'dia_fechamento_mes', 'dias_apos_fechamento_mes', 'cota_calcular_por_hora'] as const

const TEXTOS: Record<SecaoConfiguracoes, { titulo: string; carregando: string; salvo: string; botao: string }> = {
  alertas: {
    titulo: 'Alertas e horas pagas',
    carregando: 'Carregando configurações...',
    salvo: 'Configurações salvas. Valem a partir do próximo fechamento.',
    botao: 'Salvar configurações',
  },
  calendario: {
    titulo: 'Calendário de extração',
    carregando: 'Carregando calendário...',
    salvo: 'Régua de extração salva. A prévia abaixo já considera as novas datas.',
    botao: 'Salvar régua',
  },
}

type Formulario = Record<(typeof CAMPOS_HORAS)[number] | (typeof CAMPOS_NUMERICOS)[number], string> & {
  teto_periodicidade: Config['teto_periodicidade']
  origem_horas_pagas: Config['origem_horas_pagas']
  hora_extracao: string
}

function paraFormulario(config: Config): Formulario {
  return {
    teto_horas_pagas_minutos: minutosParaEntrada(config.teto_horas_pagas_minutos),
    alerta_saldo_positivo_minutos: minutosParaEntrada(config.alerta_saldo_positivo_minutos),
    alerta_saldo_negativo_minutos: minutosParaEntrada(config.alerta_saldo_negativo_minutos),
    teto_periodicidade: config.teto_periodicidade,
    origem_horas_pagas: config.origem_horas_pagas,
    dia_semana_extracao: String(config.dia_semana_extracao),
    hora_extracao: config.hora_extracao.slice(0, 5),
    dia_fechamento_mes: String(config.dia_fechamento_mes),
    dias_apos_fechamento_mes: String(config.dias_apos_fechamento_mes),
    cota_calcular_por_hora: String(config.cota_calcular_por_hora),
  }
}

type Alteracoes = Partial<Omit<Config, 'empresa_id' | 'fuso_horario' | 'atualizado_em' | 'atualizado_por'>>

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
  } else {
    const limites: Record<(typeof CAMPOS_NUMERICOS)[number], [number, number]> = {
      dia_semana_extracao: [0, 6],
      dia_fechamento_mes: [1, 28],
      dias_apos_fechamento_mes: [0, 10],
      cota_calcular_por_hora: [1, 100],
    }
    for (const campo of CAMPOS_NUMERICOS) {
      const valor = Number(form[campo])
      const [min, max] = limites[campo]
      if (!Number.isInteger(valor) || valor < min || valor > max) erros[campo] = `Informe um número entre ${min} e ${max}.`
      else if (valor !== original[campo]) alteracoes[campo] = valor
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.hora_extracao)) erros.hora_extracao = 'Use HH:MM.'
    else if (form.hora_extracao !== original.hora_extracao.slice(0, 5)) alteracoes.hora_extracao = form.hora_extracao
  }

  return { erros, alteracoes: alteracoes as Alteracoes }
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
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const textos = TEXTOS[secao]

  const { alteracoes } = validar(form, config, secao)
  const alterado = Object.keys(alteracoes).length > 0

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setMensagem(null)
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const resultado = validar(form, config, secao)
    setErros(resultado.erros)
    setMensagem(null)
    if (Object.keys(resultado.erros).length) return
    if (!Object.keys(resultado.alteracoes).length) return setMensagem({ tipo: 'ok', texto: 'Nada para salvar.' })

    setEnviando(true)
    try {
      const salva = await api<Config>('/configuracoes', { method: 'PATCH', query, json: resultado.alteracoes })
      setConfig(salva)
      setForm(paraFormulario(salva))
      setMensagem({ tipo: 'ok', texto: textos.salvo })
    } catch (e) {
      setErros(errosDeCampos(e))
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) })
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
          <Campo rotulo="Periodicidade do teto" erro={erros.teto_periodicidade}>
            {(props) => (
              <select
                {...props}
                value={form.teto_periodicidade}
                onChange={(event) => alterar('teto_periodicidade', event.target.value as Formulario['teto_periodicidade'])}
              >
                <option value="semanal">Semanal</option>
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

  const camposCalendario = (
    <fieldset className="form-secao">
      <legend>Régua de extração</legend>
      <div className="campos-grade">
        <Campo rotulo="Dia da extração" erro={erros.dia_semana_extracao}>
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
        <Campo rotulo="Hora da extração" erro={erros.hora_extracao}>
          {(props) => (
            <input {...props} type="time" value={form.hora_extracao} onChange={(event) => alterar('hora_extracao', event.target.value)} />
          )}
        </Campo>
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

  return (
    <section className="pagina">
      <header className="pagina-header">
        <h1>{textos.titulo}</h1>
        <p className="pagina-sub">
          Última alteração
          {config.atualizado_por ? ` por ${config.atualizado_por.nome}` : ''} em {formatarDataHora(config.atualizado_em)}.
        </p>
      </header>

      <form className="card" onSubmit={salvar} noValidate>
        {secao === 'alertas' ? camposAlertas : camposCalendario}

        <div className="form-secao">
          {mensagem && (
            <p className={mensagem.tipo === 'ok' ? 'form-ok' : 'form-erro'} role={mensagem.tipo === 'ok' ? 'status' : 'alert'}>
              {mensagem.texto}
            </p>
          )}
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

      {secao === 'calendario' && <PreviaCalendario versao={reguaAlterada} podeAjustar />}
    </section>
  )
}
