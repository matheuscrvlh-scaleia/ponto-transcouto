import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as auditoria from '../models/auditoria.models'
import * as configuracoesModel from '../models/configuracoes.models'
import { previsaoDaRegua } from '../services/calendario.service'
import { exigirEmpresa } from '../services/escopo.service'
import { empresaQuerySchema } from '../types/comum.types'
import {
    atualizarConfiguracoesSchema,
    calendarioQuerySchema,
    camposRegua,
    camposRh,
    type CicloCalendario,
} from '../types/configuracoes.types'
import { invalido, naoEncontrado, proibido } from '../utils/errors'

async function buscarConfiguracao(empresaId: number) {
    const config = await configuracoesModel.buscar(empresaId)
    if (!config) throw naoEncontrado('Configuração da empresa não encontrada.')
    return config
}

export async function obter(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaQuerySchema.parse(req.query)
    res.send(await buscarConfiguracao(exigirEmpresa(req.usuario, empresa_id)))
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaQuerySchema.parse(req.query)
    const campos = atualizarConfiguracoesSchema.parse(req.body)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)

    const chaves = Object.keys(campos) as (keyof typeof campos)[]
    if (chaves.length === 0) throw invalido('Nenhum campo para atualizar.')

    if (req.usuario.perfil === 'rh') {
        const naoPermitidos = chaves.filter(c => !(camposRh as readonly string[]).includes(c))
        if (naoPermitidos.length) throw proibido(`O RH não pode alterar: ${naoPermitidos.join(', ')}.`)
    }

    const anterior = await buscarConfiguracao(empresaId)
    const mudouRegua = camposRegua.some(c => campos[c] !== undefined && campos[c] !== anterior[c])

    const atualizada = await withTransaction(async client => {
        const config = await configuracoesModel.atualizar(empresaId, campos, req.usuario.id, client)
        const ciclosDescartados = mudouRegua ? await configuracoesModel.descartarCiclosNaoIniciados(empresaId, client) : 0
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId,
                acao: 'configuracao.alterada',
                entidade: 'configuracoes',
                entidadeId: empresaId,
                dados: {
                    antes: Object.fromEntries(chaves.map(c => [c, anterior[c]])),
                    depois: campos,
                    ciclos_descartados: ciclosDescartados,
                },
                ip: req.ip,
            },
            client,
        )
        return config
    })

    res.send(atualizada)
}

export async function calendario(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id, meses } = calendarioQuerySchema.parse(req.query)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)
    const config = await buscarConfiguracao(empresaId)

    const ate = new Date()
    ate.setMonth(ate.getMonth() + meses)

    const criados = await configuracoesModel.ciclosFuturos(empresaId, ate)
    const referenciasCriadas = new Set(criados.map(c => c.data_referencia))

    const previstos: CicloCalendario[] = previsaoDaRegua(config, meses * 6 + 2)
        .filter(p => p.gatilho_em <= ate && !referenciasCriadas.has(p.data_referencia))
        .map(p => ({
            ciclo_id: null,
            tipo: p.tipo,
            periodo_inicio: p.periodo_inicio,
            data_referencia: p.data_referencia,
            gatilho_em: p.gatilho_em,
            gatilho_previsto_em: p.gatilho_em,
            semana_fechamento_mes: p.tipo === 'fechamento_mes',
            ajustado: false,
        }))

    const todos = [...criados, ...previstos]
    res.send(todos.sort((a, b) => new Date(a.gatilho_em).getTime() - new Date(b.gatilho_em).getTime()))
}
