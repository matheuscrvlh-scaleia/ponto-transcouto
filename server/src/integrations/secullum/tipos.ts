export type CredenciaisSecullum = {
    empresaId: number
    usuario: string
    senha: string
    bancoId: string
}

export type TokenSecullum = {
    accessToken: string
    expiraEm: number
}

export type BancoSecullumCompleto = {
    id: string
    identificador: string | null
    clienteId: string
    nome: string
}

export type EmpresaSecullum = {
    id: number | null
    nome: string
    documento: string
    desativada: boolean
}

export type FuncionarioSecullum = {
    id: number | null
    nome: string
    cpf: string
    numeroFolha: string | null
    admissao: string | null
    demissao: string | null
    empresaId: number | null
    empresaDocumento: string | null
    departamento: string | null
    funcao: string | null
    invisivel: boolean
}

export type TotaisSecullum = {
    colunas: string[]
    totais: string[]
    /** Linhas por dia (rota Calcular completa), alinhadas com `colunas`; a SomenteTotais não traz. */
    dias?: DiaSecullum[]
}

export type DiaSecullum = {
    dia: string
    valores: string[]
}

export type FiltroCalculo = {
    cpf: string
    dataInicial: string
    dataFinal: string
}

export type TipoErroSecullum = 'auth' | 'validacao' | 'rate_limit' | 'nao_encontrado' | 'servidor' | 'rede' | 'formato'

export class SecullumError extends Error {
    constructor(
        message: string,
        public tipo: TipoErroSecullum,
        public status?: number,
        public detalhes?: unknown,
        public retryAfterMs?: number,
    ) {
        super(message)
    }

    get retentavel() {
        return this.tipo === 'servidor' || this.tipo === 'rede' || this.tipo === 'rate_limit'
    }
}

export type GanchosChamada = {
    antes?: (rota: string) => Promise<void>
    depois?: (rota: string, status: number | null, duracaoMs: number) => Promise<void>
}

export type OpcoesCliente = {
    timeoutMs?: number
    tentativas?: number
    backoffMs?: number
    ganchos?: GanchosChamada
}

/** Uma marcação da FonteDados (sem PIS: só o necessário para achar o colaborador). */
export type MarcacaoSecullum = {
    id: number
    funcionarioId: number | null
    cpf: string | null
    data: string
    hora: string
    tipo: number
    origem: number
    equipamentoId: number | null
    incluidaEm: string | null
}
