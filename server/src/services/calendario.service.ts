export type ConfigCalendario = {
    dia_semana_extracao: number
    hora_extracao: string
    dia_fechamento_mes: number
    dias_apos_fechamento_mes: number
    fuso_horario: string
}

export type CicloPrevisto = {
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
    gatilho_em: Date
}

const MS_DIA = 86400000

// Datas civis são representadas como número de dias desde 1970-01-01 (UTC), sem fuso.
const dia = (ano: number, mes: number, d: number) => Date.UTC(ano, mes - 1, d) / MS_DIA

function partes(n: number) {
    const data = new Date(n * MS_DIA)
    return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, d: data.getUTCDate() }
}

export function diaParaIso(n: number) {
    return new Date(n * MS_DIA).toISOString().slice(0, 10)
}

/** "2026-09-15" → "2026-09-16". */
export function diaSeguinte(iso: string) {
    return diaParaIso(Date.parse(iso) / MS_DIA + 1)
}

/**
 * Primeiro dia que a coleta puxa. A semanal puxa sempre o período inteiro (do dia seguinte ao último fechamento do
 * mês), então as correções do RH durante o mês entram na coleta seguinte. Com congelar dados passados, o fechamento
 * do mês puxa só os dias depois da última fotografia do colaborador e soma a ela: o RH zera as horas no fechamento,
 * e puxar o mês inteiro de novo traria tudo zerado. Sem fotografia anterior, puxa o período inteiro.
 */
export function inicioDaColeta(
    periodoInicio: string,
    anterior: { data_referencia: string } | null,
    congelar: boolean,
    tipo: 'semanal' | 'fechamento_mes',
) {
    return congelar && tipo === 'fechamento_mes' && anterior ? diaSeguinte(anterior.data_referencia) : periodoInicio
}

const diaDaSemana = (n: number) => new Date(n * MS_DIA).getUTCDay()

function camposNoFuso(instante: number, fuso: string) {
    const formato = new Intl.DateTimeFormat('en-US', {
        timeZone: fuso,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const valores = Object.fromEntries(formato.formatToParts(new Date(instante)).map(p => [p.type, p.value]))
    return {
        ano: Number(valores.year), mes: Number(valores.month), d: Number(valores.day),
        hora: Number(valores.hour), minuto: Number(valores.minute), segundo: Number(valores.second),
    }
}

function deslocamentoMs(instante: number, fuso: string) {
    const c = camposNoFuso(instante, fuso)
    const comoUtc = Date.UTC(c.ano, c.mes - 1, c.d, c.hora, c.minuto, c.segundo)
    return comoUtc - Math.floor(instante / 1000) * 1000
}

export function dataLocal(instante: Date, fuso: string) {
    const c = camposNoFuso(instante.getTime(), fuso)
    return dia(c.ano, c.mes, c.d)
}

export function instanteLocal(n: number, hora: number, minuto: number, fuso: string) {
    const ingenuo = n * MS_DIA + (hora * 60 + minuto) * 60000
    const primeiro = deslocamentoMs(ingenuo, fuso)
    const segundo = deslocamentoMs(ingenuo - primeiro, fuso)
    return new Date(ingenuo - segundo)
}

function ultimoFechamentoAte(n: number, diaFechamento: number) {
    const { ano, mes } = partes(n)
    const doMes = dia(ano, mes, diaFechamento)
    return doMes <= n ? doMes : dia(ano, mes - 1, diaFechamento)
}

export function inicioDoPeriodo(n: number, diaFechamento: number) {
    return ultimoFechamentoAte(n - 1, diaFechamento) + 1
}

/** Período de apuração que contém hoje (fuso da empresa): usado pelo tempo real, que puxa do início até hoje. */
export function periodoDeHoje(config: { fuso_horario: string; dia_fechamento_mes: number }, agora = new Date()) {
    const hoje = dataLocal(agora, config.fuso_horario)
    return { periodo_inicio: diaParaIso(inicioDoPeriodo(hoje, config.dia_fechamento_mes)), hoje: diaParaIso(hoje) }
}

function lerHora(hora: string) {
    const [h = '0', m = '0'] = hora.split(':')
    return { hora: Number(h), minuto: Number(m) }
}

/*
 * Régua: duas coletas independentes.
 * - Semanal: toda semana em dia_semana_extracao/hora_extracao (fuso da config), data_referencia = véspera do gatilho.
 * - Fechamento do mês: data_referencia = dia de fechamento, gatilho = fechamento + dias_apos_fechamento_mes.
 * periodo_inicio = fechamento anterior + 1. A semanal sai da régua quando repete a referência do fechamento ou quando
 * já é do período novo mas rodaria antes do fechamento do período anterior (o saldo herdado ainda não estaria gravado).
 */
function cicloSemanal(config: ConfigCalendario, diaGatilho: number): CicloPrevisto | null {
    const { hora, minuto } = lerHora(config.hora_extracao)
    const referencia = diaGatilho - 1
    const inicio = inicioDoPeriodo(referencia, config.dia_fechamento_mes)
    const fechamentoAnterior = inicio - 1

    if (ultimoFechamentoAte(referencia, config.dia_fechamento_mes) === referencia) return null
    if (diaGatilho < fechamentoAnterior + config.dias_apos_fechamento_mes) return null

    return {
        tipo: 'semanal',
        periodo_inicio: diaParaIso(inicio),
        data_referencia: diaParaIso(referencia),
        gatilho_em: instanteLocal(diaGatilho, hora, minuto, config.fuso_horario),
    }
}

function cicloDoFechamento(config: ConfigCalendario, fechamento: number): CicloPrevisto {
    const { hora, minuto } = lerHora(config.hora_extracao)
    return {
        tipo: 'fechamento_mes',
        periodo_inicio: diaParaIso(inicioDoPeriodo(fechamento, config.dia_fechamento_mes)),
        data_referencia: diaParaIso(fechamento),
        gatilho_em: instanteLocal(fechamento + config.dias_apos_fechamento_mes, hora, minuto, config.fuso_horario),
    }
}

export function proximosCiclos(config: ConfigCalendario, aPartirDe: Date, quantidade: number): CicloPrevisto[] {
    if (quantidade <= 0) return []

    const ciclos: CicloPrevisto[] = []

    // semanais até ter `quantidade` a partir de aPartirDe (mais as que caem fora por coincidir com o fechamento)
    let gatilho = dataLocal(aPartirDe, config.fuso_horario) - 14
    while (diaDaSemana(gatilho) !== config.dia_semana_extracao) gatilho++
    let semanais = 0
    let ultimoGatilho = gatilho
    while (semanais < quantidade) {
        const ciclo = cicloSemanal(config, gatilho)
        if (ciclo && ciclo.gatilho_em.getTime() >= aPartirDe.getTime()) {
            ciclos.push(ciclo)
            semanais++
        }
        ultimoGatilho = gatilho
        gatilho += 7
    }

    // fechamentos que disparam até a última semanal gerada: cobrem tudo o que pode entrar nos `quantidade` primeiros
    const inicio = dataLocal(aPartirDe, config.fuso_horario) - 15
    let fechamento = ultimoFechamentoAte(inicio, config.dia_fechamento_mes)
    while (fechamento + config.dias_apos_fechamento_mes <= ultimoGatilho) {
        const ciclo = cicloDoFechamento(config, fechamento)
        if (ciclo.gatilho_em.getTime() >= aPartirDe.getTime()) ciclos.push(ciclo)
        const { ano, mes } = partes(fechamento)
        fechamento = dia(ano, mes + 1, config.dia_fechamento_mes)
    }

    // mesmo horário: a referência mais antiga primeiro (o fechamento antes da semanal do período novo)
    return ciclos
        .sort((a, b) => a.gatilho_em.getTime() - b.gatilho_em.getTime() || a.data_referencia.localeCompare(b.data_referencia))
        .slice(0, quantidade)
}

// Para telas: fuso inválido no banco não derruba a resposta, só deixa a previsão vazia.
export function previsaoDaRegua(config: ConfigCalendario, quantidade: number, aPartirDe = new Date()): CicloPrevisto[] {
    try {
        return proximosCiclos(config, aPartirDe, quantidade)
    } catch {
        return []
    }
}
