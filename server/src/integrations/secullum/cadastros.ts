import type { ClienteSecullum } from './cliente'
import { dataIsoOuNula, normalizarChaves, cpfDaSecullum, normalizarDocumento, numeroOuNulo, textoOuNulo } from './normalizar'
import { SecullumError, type EmpresaSecullum, type FuncionarioSecullum } from './tipos'

function exigirLista(resposta: unknown, rota: string): unknown[] {
    if (!Array.isArray(resposta)) throw new SecullumError(`Secullum ${rota}: resposta não é uma lista.`, 'formato')
    return resposta
}

export async function listarEmpresas(cliente: ClienteSecullum): Promise<EmpresaSecullum[]> {
    const lista = exigirLista(await cliente.get('Empresas'), 'Empresas')
    return lista.map(item => {
        const e = normalizarChaves(item)
        return {
            id: numeroOuNulo(e.id),
            nome: textoOuNulo(e.nome) ?? '',
            documento: normalizarDocumento(e.documento ?? e.cnpjcpf ?? e.cnpj),
            desativada: e.desativada === true,
        }
    })
}

// Só os campos que persistimos: o restante (endereço, RG, filiação, PIS...) é descartado aqui (LGPD).
export async function listarFuncionarios(cliente: ClienteSecullum): Promise<FuncionarioSecullum[]> {
    const lista = exigirLista(await cliente.get('Funcionarios'), 'Funcionarios')
    return lista.flatMap(item => {
        const f = normalizarChaves(item)
        const cpf = cpfDaSecullum(f.cpf)
        if (!cpf) return []

        const empresa = normalizarChaves(f.empresa)
        const departamento = normalizarChaves(f.departamento)
        const funcao = normalizarChaves(f.funcao)
        const documento = normalizarDocumento(f.empresacnpjcpf ?? empresa.documento ?? '')

        return [{
            id: numeroOuNulo(f.id),
            nome: textoOuNulo(f.nome) ?? '',
            cpf,
            numeroFolha: textoOuNulo(f.numerofolha),
            admissao: dataIsoOuNula(f.admissao),
            demissao: dataIsoOuNula(f.demissao),
            empresaId: numeroOuNulo(f.empresaid ?? empresa.id),
            empresaDocumento: documento || null,
            departamento: textoOuNulo(f.departamentodescricao ?? departamento.descricao),
            funcao: textoOuNulo(f.funcaodescricao ?? funcao.descricao),
            invisivel: f.invisivel === true,
        }]
    })
}
