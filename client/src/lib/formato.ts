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

export function mascararCpfEntrada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

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
