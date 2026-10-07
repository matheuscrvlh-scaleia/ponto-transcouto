import type { DataHoraISO, DataISO, Minutos } from '../types/api'

const MENOS = '−'
const FUSO = 'America/Sao_Paulo'

/** -90 → "−01:30"; 7505 → "125:05"; com sinal: 600 → "+10:00". */
export function formatarMinutos(min: Minutos, { sinal = false } = {}): string {
  const valor = Math.trunc(min)
  const abs = Math.abs(valor)
  const texto = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  if (valor < 0) return `${MENOS}${texto}`
  return sinal && valor > 0 ? `+${texto}` : texto
}

export function minutosPorExtenso(min: Minutos): string {
  const valor = Math.trunc(min)
  const abs = Math.abs(valor)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const partes = [h && `${h} ${h === 1 ? 'hora' : 'horas'}`, m && `${m} ${m === 1 ? 'minuto' : 'minutos'}`].filter(Boolean)
  const texto = partes.length ? partes.join(' e ') : 'zero'
  return valor < 0 ? `menos ${texto}` : texto
}

/** Datas DATE ('YYYY-MM-DD') são formatadas sem `new Date` para não cair no dia anterior por fuso. */
export function formatarData(data: DataISO | null | undefined, { ano = true } = {}): string {
  if (!data) return '—'
  const [a, m, d] = data.slice(0, 10).split('-')
  return ano ? `${d}/${m}/${a}` : `${d}/${m}`
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatarDataHora(iso: DataHoraISO | null | undefined): string {
  if (!iso) return '—'
  return fmtDataHora.format(new Date(iso)).replace(',', ' às')
}

export function formatarDiaSemana(iso: DataHoraISO | null | undefined): string {
  if (!iso) return '—'
  return fmtDiaSemana.format(new Date(iso)).replace(',', '').replace(',', ' às').replace('.', '')
}

export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Minutos → "HH:MM" para campos de formulário (sem sinal). */
export function minutosParaEntrada(min: Minutos): string {
  return formatarMinutos(Math.abs(min))
}

/** Aceita "10", "10:30", "10h30", "10h"; devolve minutos ou null se inválido (0–999:59). */
export function entradaParaMinutos(texto: string): Minutos | null {
  const achou = /^(\d{1,3})(?:\s*(?::|h)\s*(\d{0,2}))?\s*(?:min)?$/i.exec(texto.trim())
  if (!achou) return null
  const horas = Number(achou[1])
  const minutos = achou[2] ? Number(achou[2]) : 0
  if (minutos > 59) return null
  return horas * 60 + minutos
}

export function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Máscara enquanto digita: "11222333000181" → "11.222.333/0001-81". */
export function mascararCnpjEntrada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** Confere os dígitos verificadores do CNPJ (aceita com ou sem máscara). */
export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const digito = (base: string) => {
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (((base.length - 1 - i) % 8) + 2), 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return digito(d.slice(0, 12)) === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13])
}

/** Telefone com DDD: "11987654321" → "(11) 98765-4321"; "1133334444" → "(11) 3333-4444". */
export function formatarTelefone(telefone: string | null | undefined): string {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone ?? ''
}

/** Máscara de telefone enquanto digita (fixo ou celular). */
export function mascararTelefoneEntrada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  const meio = d.length === 11 ? 5 : 4
  const resto = d.slice(2)
  return `(${d.slice(0, 2)}) ${resto.slice(0, meio)}${resto.length > meio ? `-${resto.slice(meio)}` : ''}`
}

export function mascararCpfEntrada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

/** Confere os dígitos verificadores do CPF (aceita com ou sem máscara). */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const digito = (tamanho: number) => {
    const soma = [...d.slice(0, tamanho)].reduce((total, n, i) => total + Number(n) * (tamanho + 1 - i), 0)
    return ((soma * 10) % 11) % 10
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function formatarDuracao(inicio: DataHoraISO, fim: DataHoraISO | null): string {
  if (!fim) return 'em andamento'
  const segundos = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000))
  if (segundos < 60) return `${segundos}s`
  const minutos = Math.round(segundos / 60)
  return minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`
}

const fmtPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function partesNoFuso(data: Date) {
  const p = Object.fromEntries(fmtPartes.formatToParts(data).map((parte) => [parte.type, parte.value]))
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute }
}

/** ISO → valor de <input type="datetime-local"> no horário de Brasília (independe do fuso do navegador). */
export function isoParaDataHoraLocal(iso: DataHoraISO): string {
  const { ano, mes, dia, hora, minuto } = partesNoFuso(new Date(iso))
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${ano}-${dois(mes)}-${dois(dia)}T${dois(hora)}:${dois(minuto)}`
}

/** Valor de datetime-local (horário de Brasília) → ISO UTC. */
export function dataHoraLocalParaIso(valor: string): DataHoraISO | null {
  const achou = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor)
  if (!achou) return null
  const [ano, mes, dia, hora, minuto] = achou.slice(1).map(Number)
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto)
  const p = partesNoFuso(new Date(comoUtc))
  const deslocamento = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - comoUtc
  return new Date(comoUtc - deslocamento).toISOString()
}

/** "Maria da Silva Souza" → "MS" (primeira e última palavra), para avatares. */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (partes[0][0] + ultima).toLocaleUpperCase('pt-BR')
}

const fmtDataIso = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Data de hoje no horário de Brasília, como 'YYYY-MM-DD' (valor de <input type="date">). */
export function hojeISO(): DataISO {
  return fmtDataIso.format(new Date())
}

/** Soma (ou subtrai) dias de uma data 'YYYY-MM-DD' sem passar pelo fuso do navegador. */
export function somarDias(data: DataISO, dias: number): DataISO {
  const [a, m, d] = data.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

export type PeriodoRapido = 'hoje' | 'ontem' | 'semana' | 'mes'

export const PERIODOS_RAPIDOS: { valor: PeriodoRapido; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'ontem', rotulo: 'Ontem' },
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'mes', rotulo: 'Este mês' },
]

/** Datas de uma seleção rápida; a semana começa na segunda-feira. */
export function datasDoPeriodo(periodo: PeriodoRapido, hoje: DataISO = hojeISO()): { de: DataISO; ate: DataISO } {
  if (periodo === 'hoje') return { de: hoje, ate: hoje }
  if (periodo === 'ontem') return { de: somarDias(hoje, -1), ate: somarDias(hoje, -1) }
  if (periodo === 'mes') return { de: `${hoje.slice(0, 8)}01`, ate: hoje }
  const [a, m, d] = hoje.split('-').map(Number)
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return { de: somarDias(hoje, -((diaSemana + 6) % 7)), ate: hoje }
}

/** Qual seleção rápida corresponde a um intervalo (ou null, se for um intervalo livre). */
export function periodoRapidoDe(de: DataISO | undefined, ate: DataISO | undefined, hoje: DataISO = hojeISO()) {
  return PERIODOS_RAPIDOS.find(({ valor }) => {
    const datas = datasDoPeriodo(valor, hoje)
    return datas.de === de && datas.ate === ate
  })?.valor ?? null
}

/** Dias corridos entre duas datas 'YYYY-MM-DD' (fim − início). */
export function diasEntre(inicio: DataISO, fim: DataISO): number {
  const utc = (data: DataISO) => {
    const [a, m, d] = data.slice(0, 10).split('-').map(Number)
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((utc(fim) - utc(inicio)) / 86_400_000)
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })

/** ISO → "HH:MM" no horário de Brasília. */
export function formatarHora(iso: DataHoraISO): string {
  return fmtHora.format(new Date(iso))
}

/** Dia (horário de Brasília) de um instante, como 'YYYY-MM-DD'. */
export function dataDoInstante(iso: DataHoraISO): DataISO {
  return fmtDataIso.format(new Date(iso))
}

/** Último acesso de uma conta: "Hoje às 14:20", "Ontem às 09:10", "Há 3 dias" ou a data. */
export function formatarUltimoAcesso(iso: DataHoraISO | null | undefined): string {
  if (!iso) return 'Nunca acessou'
  const dia = dataDoInstante(iso)
  const dias = diasEntre(dia, hojeISO())
  if (dias <= 0) return `Hoje às ${formatarHora(iso)}`
  if (dias === 1) return `Ontem às ${formatarHora(iso)}`
  if (dias < 7) return `Há ${dias} dias`
  return formatarData(dia)
}

/** ISO → "HH:MM" se for hoje; senão "dd/mm às HH:MM" (ou sempre com data, com `comData`). */
export function formatarHoraOuData(iso: DataHoraISO, { comData = false } = {}): string {
  const dia = dataDoInstante(iso)
  const hora = formatarHora(iso)
  return comData || dia !== hojeISO() ? `${formatarData(dia, { ano: false })} às ${hora}` : hora
}

/** ISO → "hoje às 13:42", "amanhã às 06:00", "ontem às 18:10" ou "27/10 às 06:00" (horário de Brasília). */
export function formatarQuando(iso: DataHoraISO): string {
  const dia = dataDoInstante(iso)
  const hoje = hojeISO()
  const hora = formatarHora(iso)
  if (dia === hoje) return `hoje às ${hora}`
  if (dia === somarDias(hoje, 1)) return `amanhã às ${hora}`
  if (dia === somarDias(hoje, -1)) return `ontem às ${hora}`
  return `${formatarData(dia, { ano: dia.slice(0, 4) !== hoje.slice(0, 4) })} às ${hora}`
}

/** Intervalo em minutos → "25 min", "1h", "1h30". */
export function formatarIntervalo(minutos: number): string {
  const total = Math.max(1, Math.round(minutos))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

const fmtDiaPorExtenso = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long' })

/** 'YYYY-MM-DD' → "Hoje", "Ontem" ou "terça-feira, 30 de setembro" (com o ano se não for o atual). */
export function formatarDiaPorExtenso(data: DataISO): string {
  const hoje = hojeISO()
  if (data === hoje) return 'Hoje'
  if (data === somarDias(hoje, -1)) return 'Ontem'
  const [a, m, d] = data.slice(0, 10).split('-').map(Number)
  const texto = fmtDiaPorExtenso.format(new Date(Date.UTC(a, m - 1, d)))
  return a === Number(hoje.slice(0, 4)) ? texto : `${texto} de ${a}`
}
