export function horasParaMinutos(valor: string | null | undefined) {
    const texto = (valor ?? '').trim()
    if (!texto) return 0

    const negativo = texto.startsWith('-')
    const [h, m = '0'] = texto.replace(/^[-+]/, '').split(':')
    const total = Number(h) * 60 + Number(m)

    if (Number.isNaN(total)) throw new Error(`Hora inválida: "${valor}"`)
    return negativo ? -total : total
}

export function minutosParaHoras(minutos: number) {
    const sinal = minutos < 0 ? '-' : ''
    const abs = Math.abs(minutos)
    return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}
