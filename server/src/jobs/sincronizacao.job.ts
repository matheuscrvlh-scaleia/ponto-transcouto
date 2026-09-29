import { db, withTransaction, type Executor } from '../db/database'
import { listarEmpresas, listarFuncionarios } from '../integrations/secullum/cadastros'
import { documentoValido } from '../integrations/secullum/normalizar'
import type { EmpresaSecullum, FuncionarioSecullum } from '../integrations/secullum/tipos'
import {
    buscarCredenciais,
    desativarColaboradoresAusentes,
    desativarUnidadesAusentes,
    empresasParaSincronizar,
    marcarSincronizado,
    registrarChamadaApi,
    salvarColaboradores,
    salvarUnidades,
    unidadesPorDocumento,
    type ColaboradorSincronizado,
    type UnidadeSincronizada,
} from '../models/sincronizacao.models'
import { clienteDaEmpresa } from './cliente-empresa'
import type { Log } from './log'

export type ResumoSincronizacao = {
    unidades: number
    unidadesDesativadas: number
    colaboradores: number
    colaboradoresDesativados: number
    ignorados: number
}

// Readmissão pode repetir o CPF: fica o cadastro sem demissão, senão o de admissão mais recente.
function escolherPorCpf(funcionarios: FuncionarioSecullum[]) {
    const porCpf = new Map<string, FuncionarioSecullum>()
    for (const f of funcionarios) {
        const atual = porCpf.get(f.cpf)
        const melhor = !atual
            || (atual.demissao && !f.demissao)
            || (!!atual.demissao === !!f.demissao && (f.admissao ?? '') > (atual.admissao ?? ''))
        if (melhor) porCpf.set(f.cpf, f)
    }
    return [...porCpf.values()]
}

function escolherPorDocumento(empresas: EmpresaSecullum[]) {
    const porDocumento = new Map<string, UnidadeSincronizada>()
    for (const e of empresas) {
        if (!documentoValido(e.documento)) continue
        const atual = porDocumento.get(e.documento)
        if (!atual || (!atual.ativo && !e.desativada)) {
            porDocumento.set(e.documento, { documento: e.documento, razao_social: e.nome || e.documento, ativo: !e.desativada })
        }
    }
    return [...porDocumento.values()]
}

export async function sincronizarEmpresa(empresaId: number, log: Log, ex: Executor = db): Promise<ResumoSincronizacao> {
    const credenciais = await buscarCredenciais(empresaId, ex)
    if (!credenciais) throw new Error(`Empresa ${empresaId} não encontrada.`)

    const cliente = clienteDaEmpresa(credenciais, {
        ganchos: {
            depois: (rota, status, duracaoMs) =>
                registrarChamadaApi({ empresaId, execucaoId: null, rota, status, duracaoMs }, ex),
        },
    })

    const empresasSecullum = await listarEmpresas(cliente)
    const funcionarios = await listarFuncionarios(cliente)
    if (empresasSecullum.length === 0 || funcionarios.length === 0) {
        throw new Error('Secullum devolveu lista vazia de empresas ou funcionários; nada foi desativado.')
    }

    const unidades = escolherPorDocumento(empresasSecullum)
    const documentoPorIdSecullum = new Map(
        empresasSecullum.filter(e => e.id !== null).map(e => [e.id as number, e.documento]),
    )

    return withTransaction(async client => {
        await salvarUnidades(empresaId, unidades, client)
        const unidadesDesativadas = await desativarUnidadesAusentes(empresaId, unidades.map(u => u.documento), client)
        const unidadePorDocumento = await unidadesPorDocumento(empresaId, client)

        let ignorados = 0
        const colaboradores: ColaboradorSincronizado[] = []
        for (const f of escolherPorCpf(funcionarios)) {
            const documento = f.empresaDocumento
                ?? (f.empresaId !== null ? documentoPorIdSecullum.get(f.empresaId) : undefined)
            const unidadeId = documento ? unidadePorDocumento.get(documento) : undefined
            if (!unidadeId) {
                ignorados++
                continue
            }
            const datasCoerentes = !f.admissao || !f.demissao || f.demissao >= f.admissao
            colaboradores.push({
                unidade_id: unidadeId,
                secullum_id: f.id,
                nome: f.nome || f.cpf,
                cpf: f.cpf,
                numero_folha: f.numeroFolha,
                departamento: f.departamento,
                funcao: f.funcao,
                data_admissao: datasCoerentes ? f.admissao : null,
                data_demissao: f.demissao,
                ativo: !f.demissao && !f.invisivel,
            })
        }

        await salvarColaboradores(empresaId, colaboradores, client)
        const colaboradoresDesativados = await desativarColaboradoresAusentes(empresaId, colaboradores.map(c => c.cpf), client)
        await marcarSincronizado(empresaId, client)

        const resumo = {
            unidades: unidades.length,
            unidadesDesativadas,
            colaboradores: colaboradores.length,
            colaboradoresDesativados,
            ignorados,
        }
        log.info(`sincronização empresa ${empresaId}: ${JSON.stringify(resumo)}`)
        return resumo
    }, ex)
}

const ESPERA_APOS_FALHA_MS = 15 * 60 * 1000
const falhasRecentes = new Map<number, number>()

export async function executarSincronizacoes(log: Log, ex: Executor = db, agora = Date.now()) {
    for (const empresaId of await empresasParaSincronizar(ex)) {
        const ultimaFalha = falhasRecentes.get(empresaId)
        if (ultimaFalha && agora - ultimaFalha < ESPERA_APOS_FALHA_MS) continue
        try {
            await sincronizarEmpresa(empresaId, log, ex)
            falhasRecentes.delete(empresaId)
        } catch (err) {
            falhasRecentes.set(empresaId, agora)
            log.erro(`sincronização empresa ${empresaId} falhou: ${(err as Error).message}`)
        }
    }
}
