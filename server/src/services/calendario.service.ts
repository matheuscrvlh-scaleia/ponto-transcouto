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

function lerHora(hora: string) {
    const [h = '0', m = '0'] = hora.split(':')
    return { hora: Number(h), minuto: Number(m) }
}

/*
 * Régua: gatilho semanal em dia_semana_extracao/hora_extracao (fuso da config) com data_referencia = véspera do gatilho.
 * Se a semana de referência [gatilho−7, gatilho−1] contém o dia de fechamento, o ciclo vira 'fechamento_mes':
 * data_referencia = dia de fechamento, gatilho = fechamento + dias_apos_fechamento_mes. periodo_inicio = fechamento anterior + 1.
 */
export function cicloDaSemana(config: ConfigCalendario, diaGatilho: number): CicloPrevisto {
    const { hora, minuto } = lerHora(config.hora_extracao)
    const fuso = config.fuso_horario
    const referenciaSemanal = diaGatilho - 1
    const fechamento = ultimoFechamentoAte(referenciaSemanal, config.dia_fechamento_mes)

    if (fechamento >= diaGatilho - 7) {
        return {
            tipo: 'fechamento_mes',
            periodo_inicio: diaParaIso(inicioDoPeriodo(fechamento, config.dia_fechamento_mes)),
            data_referencia: diaParaIso(fechamento),
            gatilho_em: instanteLocal(fechamento + config.dias_apos_fechamento_mes, hora, minuto, fuso),
        }
    }

    return {
        tipo: 'semanal',
        periodo_inicio: diaParaIso(inicioDoPeriodo(referenciaSemanal, config.dia_fechamento_mes)),
        data_referencia: diaParaIso(referenciaSemanal),
        gatilho_em: instanteLocal(diaGatilho, hora, minuto, fuso),
    }
}

export function proximosCiclos(config: ConfigCalendario, aPartirDe: Date, quantidade: number): CicloPrevisto[] {
    if (quantidade <= 0) return []

    let gatilho = dataLocal(aPartirDe, config.fuso_horario) - 14
    while (diaDaSemana(gatilho) !== config.dia_semana_extracao) gatilho++

    const ciclos: CicloPrevisto[] = []
    // O gatilho do fechamento pode passar do semanal seguinte (dias_apos grande): gera 2 semanas a mais e ordena.
    let semanasExtras = 0
    while (semanasExtras < 2) {
        const ciclo = cicloDaSemana(config, gatilho)
        if (ciclo.gatilho_em.getTime() >= aPartirDe.getTime()) ciclos.push(ciclo)
        if (ciclos.length >= quantidade) semanasExtras++
        gatilho += 7
    }

    return ciclos.sort((a, b) => a.gatilho_em.getTime() - b.gatilho_em.getTime()).slice(0, quantidade)
}

// Para telas: fuso inválido no banco não derruba a resposta, só deixa a previsão vazia.
export function previsaoDaRegua(config: ConfigCalendario, quantidade: number, aPartirDe = new Date()): CicloPrevisto[] {
    try {
        return proximosCiclos(config, aPartirDe, quantidade)
    } catch {
        return []
    }
}
