export type UserBody = {
    nome: string
    senha?: string
    hashedPassword?:string
    email: string
    cpf?: number
    ativo?: boolean
}