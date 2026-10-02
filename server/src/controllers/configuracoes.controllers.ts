import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import { minutosPorRodada } from '../jobs/tempo-real.job'
import * as auditoria from '../models/auditoria.models'
import * as configuracoesModel from '../models/configuracoes.models'
import { contarElegiveis } from '../models/tempo-real.models'
import { periodoDeHoje, previsaoDaRegua } from '../services/calendario.service'
import { exigirEmpresa } from '../services/escopo.service'
import { empresaQuerySchema } from '../types/comum.types'
import {
    atualizarConfiguracoesSchema,
    calendarioQuerySchema,
    camposRegua,
    camposRh,
    telaDoCampo,
    type CicloCalendario,
} from '../types/configuracoes.types'
import { invalido, naoEncontrado, proibido } from '../utils/errors'

/** Configuração + quanto tempo o tempo real leva para atualizar todos os colaboradores uma vez. */
async function buscarConfiguracao(empresaId: number) {
    const config = await configuracoesModel.buscar(empresaId)
    if (!config) throw naoEncontrado('Configuração da empresa não encontrada.')

    let colaboradores = 0
    try {
        const { periodo_inicio, hoje } = periodoDeHoje(config)
        colaboradores = await contarElegiveis(empresaId, periodo_inicio, hoje)
    } catch {
        // fuso inválido no banco: a estimativa fica vazia, a configuração continua editável
    }
    return {
        ...config,
        tempo_real_estimativa: { colaboradores, minutos_por_rodada: minutosPorRodada(colaboradores, config.cota_calcular_por_hora) },
    }
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

    if (req.usuario.tipo !== 'equipe') {
        const naoPermitidos = chaves.filter(c => !(camposRh as readonly string[]).includes(c))
        if (naoPermitidos.length) throw proibido(`Somente a equipe Scale IA pode alterar: ${naoPermitidos.join(', ')}.`)
        // cada campo pertence a uma tela (Alertas e horas pagas ou Atualização dos dados)
        const semTela = chaves.filter(c => !req.usuario.telas.includes(telaDoCampo[c as keyof typeof telaDoCampo]))
        if (semTela.length) throw proibido(`Seu grupo de permissão não libera alterar: ${semTela.join(', ')}.`)
    }

    const anterior = await buscarConfiguracao(empresaId)
    const mudouRegua = camposRegua.some(c => campos[c] !== undefined && campos[c] !== anterior[c])

    // tempo real não tem fotografia semanal, então não consegue aplicar o teto semanal de horas pagas
    const final = { ...anterior, ...campos }
    if (final.modo_extracao === 'tempo_real' && final.origem_horas_pagas === 'teto' && final.teto_periodicidade === 'semanal') {
        throw invalido(
            'O teto semanal de horas pagas precisa da atualização semanal. Mude o teto para mensal antes de usar o tempo real.',
        )
    }
    const virouTempoReal = campos.modo_extracao === 'tempo_real' && anterior.modo_extracao !== 'tempo_real'

    const atualizada = await withTransaction(async client => {
        const config = await configuracoesModel.atualizar(empresaId, campos, req.usuario, client)
        const ciclosDescartados = mudouRegua
            ? await configuracoesModel.descartarCiclosNaoIniciados(empresaId, client)
            : virouTempoReal
              ? await configuracoesModel.descartarCiclosNaoIniciados(empresaId, client, 'semanal')
              : 0
        await auditoria.registrar(
            {
                ator: req.usuario,
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

    // mesma forma do GET (com a estimativa do tempo real), já com os valores novos
    res.send(atualizada ? await buscarConfiguracao(empresaId) : atualizada)
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
