export function somenteDigitos(valor: string) {
    return valor.replace(/\D/g, '')
}

export function cpfValido(valor: string) {
    const cpf = somenteDigitos(valor)
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

    const digito = (base: string) => {
        const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (base.length + 1 - i), 0)
        const resto = (soma * 10) % 11
        return resto === 10 ? 0 : resto
    }

    return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10])
}

export function mascararCpf(cpf: string | null) {
    if (!cpf) return null
    return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`
}

export function cpfNormalizado(valor: string) {
    const cpf = somenteDigitos(valor)
    return cpfValido(cpf) ? cpf : null
}
