import { somenteDigitos } from './cpf'

export function cnpjValido(valor: string) {
    const cnpj = somenteDigitos(valor)
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false

    const digito = (base: string) => {
        // pesos 5..2 e 9..2 (primeiro dígito) / 6..2 e 9..2 (segundo)
        const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (((base.length - 1 - i) % 8) + 2), 0)
        const resto = soma % 11
        return resto < 2 ? 0 : 11 - resto
    }

    return digito(cnpj.slice(0, 12)) === Number(cnpj[12]) && digito(cnpj.slice(0, 13)) === Number(cnpj[13])
}
