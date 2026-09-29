import { somenteDigitos } from '../../utils/cpf'

// A API mistura PascalCase (respostas do manual) e camelCase (swagger): lemos tudo em minúsculas.
export function normalizarChaves(valor: unknown): Record<string, any> {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k.toLowerCase(), v]))
}

export function textoOuNulo(valor: unknown) {
    if (valor === null || valor === undefined) return null
    const texto = String(valor).trim()
    return texto === '' ? null : texto
}

export function numeroOuNulo(valor: unknown) {
    if (valor === null || valor === undefined || valor === '') return null
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
}

export function dataIsoOuNula(valor: unknown) {
    const texto = textoOuNulo(valor)
    if (!texto) return null
    const iso = /^(\d{4}-\d{2}-\d{2})/.exec(texto)
    if (iso) return iso[1].startsWith('0001-') ? null : iso[1]
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto)
    return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

export function normalizarDocumento(valor: unknown) {
    return String(valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function documentoValido(documento: string) {
    return /^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$/.test(documento)
}

export function cpfDaSecullum(valor: unknown) {
    const digitos = somenteDigitos(String(valor ?? ''))
    if (digitos.length === 0 || digitos.length > 11) return null
    return digitos.padStart(11, '0')
}
