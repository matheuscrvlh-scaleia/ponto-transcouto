import type { FastifyReply, FastifyRequest } from 'fastify'
import * as configuracoesModel from '../models/configuracoes.models'
import * as unidadesModel from '../models/unidades.models'
import { previsaoDaRegua } from '../services/calendario.service'
import { LIMITES_PADRAO, type Limites } from '../services/dashboard.service'
import { empresaDoUsuario } from '../services/escopo.service'
import { idParamSchema } from '../types/comum.types'
import { dashboardQuerySchema, listarUnidadesQuerySchema, type UnidadePainel } from '../types/unidades.types'
import { naoEncontrado } from '../utils/errors'

const DIA_MS = 24 * 60 * 60 * 1000

type Configuracao = Awaited<ReturnType<typeof configuracoesModel.buscar>>

function limitesDa(config: Configuracao): Limites {
    return config
        ? { alerta_pos: config.alerta_saldo_positivo_minutos, alerta_neg: config.alerta_saldo_negativo_minutos }
        : LIMITES_PADRAO
}

/** Próxima atualização da empresa (ciclo agendado ou previsão pela régua) e se a régua indica fechamento do mês em até 7 dias. */
async function calendarioDa(empresaId: number, config: Configuracao) {
    const proximo = await unidadesModel.proximoGatilho(empresaId)
    const previsto = !proximo && config ? previsaoDaRegua(config, 1)[0] : undefined
    return {
        proximoGatilho: proximo?.gatilho_em ?? previsto?.gatilho_em ?? null,
        avisoPelaRegua: previsto?.tipo === 'fechamento_mes' && previsto.gatilho_em.getTime() - Date.now() <= 7 * DIA_MS,
    }
}

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = listarUnidadesQuerySchema.parse(req.query)
    res.send(await unidadesModel.listarDoUsuario(req.usuario, empresaDoUsuario(req.usuario, empresa_id), LIMITES_PADRAO))
}

export async function dashboard(req: FastifyRequest, res: FastifyReply) {
    const { id } = idParamSchema.parse(req.params)
    const q = dashboardQuerySchema.parse(req.query)

    const unidade = await unidadesModel.buscarPermitida(req.usuario, id)
    if (!unidade) throw naoEncontrado('Unidade não encontrada.')

    const config = await configuracoesModel.buscar(unidade.empresa_id)
    const limites = limitesDa(config)

    const [fechamento, avisoPorCiclo, calendario] = await Promise.all([
        unidadesModel.ultimoFechamentoPublicado(unidade.id),
        unidadesModel.emSemanaDeFechamentoMes(unidade.empresa_id, unidade.id),
        calendarioDa(unidade.empresa_id, config),
    ])

    const [linhas, resumo] = fechamento
        ? await Promise.all([
              unidadesModel.linhasDashboard(fechamento.id, limites, q),
              unidadesModel.resumoDashboard(fechamento.id, limites),
          ])
        : [{ linhas: [], total: 0 }, null]

    res.send({
        unidade: { id: unidade.id, nome: unidade.nome },
        fechamento,
        aviso_fechamento_mes: avisoPorCiclo || calendario.avisoPelaRegua,
        proximo_fechamento_previsto: calendario.proximoGatilho,
        limites,
        resumo,
        colaboradores: linhas.linhas,
        total: linhas.total,
        pagina: q.pagina,
        por_pagina: q.por_pagina,
    })
}

/** Limites mais comuns entre as unidades (referência para faixas e textos quando as empresas diferem). */
function limitesPredominantes(unidades: UnidadePainel[]) {
    const contagem = new Map<string, { limites: Limites; vezes: number }>()
    for (const u of unidades) {
        const chave = `${u.alerta_pos}:${u.alerta_neg}`
        const atual = contagem.get(chave) ?? { limites: { alerta_pos: u.alerta_pos, alerta_neg: u.alerta_neg }, vezes: 0 }
        contagem.set(chave, { ...atual, vezes: atual.vezes + 1 })
    }
    const ordenados = [...contagem.values()].sort((a, b) => b.vezes - a.vezes)
    return { limites: ordenados[0]?.limites ?? LIMITES_PADRAO, variam: ordenados.length > 1 }
}

/** Painel consolidado: todas as unidades que o usuário pode ver, cada uma com o seu último fechamento publicado. */
export async function dashboardGeral(req: FastifyRequest, res: FastifyReply) {
    const q = dashboardQuerySchema.parse(req.query)

    const unidades = await unidadesModel.unidadesDoPainel(
        req.usuario,
        empresaDoUsuario(req.usuario, q.empresa_id),
        LIMITES_PADRAO,
    )
    const comDados = unidades.filter(u => u.fechamento)

    const empresas = [...new Set(unidades.map(u => u.empresa_id))]
    const [calendarios, avisosPorCiclo] = await Promise.all([
        Promise.all(empresas.map(async id => calendarioDa(id, await configuracoesModel.buscar(id)))),
        Promise.all(unidades.map(u => unidadesModel.emSemanaDeFechamentoMes(u.empresa_id, u.id))),
    ])

    const proximos = calendarios.map(c => c.proximoGatilho).filter((d): d is Date => d != null)
    const proximoGatilho = proximos.length ? new Date(Math.min(...proximos.map(d => d.getTime()))) : null

    // "dados até" do cabeçalho: o fechamento mais recente entre as unidades
    const maisRecente =
        [...comDados].sort(
            (a, b) =>
                b.fechamento!.data_referencia.localeCompare(a.fechamento!.data_referencia) ||
                new Date(b.fechamento!.publicado_em).getTime() - new Date(a.fechamento!.publicado_em).getTime(),
        )[0]?.fechamento ?? null

    const { limites, variam } = limitesPredominantes(comDados.length ? comDados : unidades)

    const [linhas, resumo] = comDados.length
        ? await Promise.all([unidadesModel.linhasDashboardGeral(unidades, q), unidadesModel.resumoDashboardGeral(unidades)])
        : [{ linhas: [], total: 0 }, null]

    res.send({
        unidade: null,
        unidades: unidades.map(({ id, nome, fechamento, alerta_pos, alerta_neg }) => ({
            id,
            nome,
            fechamento,
            alerta_pos,
            alerta_neg,
        })),
        fechamento: maisRecente,
        aviso_fechamento_mes: avisosPorCiclo.some(Boolean) || calendarios.some(c => c.avisoPelaRegua),
        proximo_fechamento_previsto: proximoGatilho,
        limites,
        limites_variam: variam,
        resumo,
        colaboradores: linhas.linhas,
        total: linhas.total,
        pagina: q.pagina,
        por_pagina: q.por_pagina,
    })
}
