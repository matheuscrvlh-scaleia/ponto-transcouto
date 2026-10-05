import type { FastifyReply, FastifyRequest } from 'fastify'
import { db, withTransaction, type Executor } from '../db/database'
import { minutosPorRodada } from '../jobs/tempo-real.job'
import * as fechamentosModel from '../models/admin-fechamentos.models'
import * as auditoria from '../models/auditoria.models'
import * as batidasModel from '../models/batidas.models'
import * as configuracoesModel from '../models/configuracoes.models'
import { criarCiclo } from '../models/extracao.models'
import * as integracaoModel from '../models/integracao.models'
import * as tempoRealModel from '../models/tempo-real.models'
import { periodoDeHoje, proximosCiclos, type CicloPrevisto } from '../services/calendario.service'
import { empresaDoUsuario, exigirEmpresa } from '../services/escopo.service'
import {
    empresaIntegracaoQuerySchema,
    listaIntegracaoQuerySchema,
    MAX_DIAS_PERIODO,
    pedirCadastrosSchema,
    pedirDadosSchema,
    previaDadosQuerySchema,
    type FechamentoPlano,
    type RegistroHistorico,
    type SemanaPlano,
} from '../types/integracao.types'
import { invalido, naoEncontrado } from '../utils/errors'

/* Integração FriPonto (Configuração): status, pedir cadastros, pedir dados de
   um período e o histórico de quem pediu o quê. Equipe (qualquer empresa),
   RH (empresa dele) e gestor (só as unidades dele). */

const DIA_MS = 86400000
/**
 * RH e gestor só puxam dados recentes: puxar um período reabre também as semanas
 * publicadas depois dele (e apaga as horas delas até a nova extração). Períodos
 * mais antigos ficam com a equipe Scale IA.
 */
export const JANELA_CLIENTE_DIAS = 45
const LIMITE_SECULLUM_POR_HORA = 100

async function escopo(req: FastifyRequest, empresaInformada: number | undefined) {
    const empresaId = exigirEmpresa(req.usuario, empresaInformada)
    const unidades = await integracaoModel.unidadesDoEscopo(req.usuario, empresaId)
    return { empresaId, unidades }
}

function hojeNoFuso(fuso: string) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date())
    } catch {
        return new Date().toISOString().slice(0, 10)
    }
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

function unidadesPedidas(unidades: { id: number }[], unidadeId: number | null | undefined) {
    if (unidades.length === 0) throw invalido('Você não tem unidades para puxar nesta empresa.')
    if (unidadeId == null) return unidades.map(u => u.id)
    if (!unidades.some(u => u.id === unidadeId)) throw naoEncontrado('Unidade não encontrada.')
    return [unidadeId]
}

/**
 * O que um pedido de dados vai fazer (usado igual pela prévia e pela execução):
 * semanas do período que ainda não existem viram ciclos novos; as que existem são
 * refeitas; e as semanas DEPOIS do período já extraídas são refeitas junto, porque
 * cada semana é calculada em cima da anterior.
 */
async function montarPlano(
    empresaId: number,
    unidadeIds: number[],
    inicio: string,
    fim: string,
    ex: Executor = db,
    janelaDias: number | null = null,
) {
    const config = await configuracoesModel.buscar(empresaId, ex)
    if (!config) throw invalido('A empresa ainda não tem o calendário de extração configurado.')

    const hoje = hojeNoFuso(config.fuso_horario)
    if (inicio > fim) throw invalido('A data de início precisa ser antes da data de fim.')
    if (fim > hoje) throw invalido('A data de fim não pode estar no futuro.')
    if (janelaDias != null) {
        const limite = new Date(Date.parse(hoje) - janelaDias * DIA_MS).toISOString().slice(0, 10)
        if (inicio < limite) {
            throw invalido(
                `Você pode puxar dados a partir de ${dataBr(limite)} (últimos ${janelaDias} dias). ` +
                    'Para períodos mais antigos, fale com a equipe Scale IA.',
            )
        }
    }
    const dias = (Date.parse(fim) - Date.parse(inicio)) / DIA_MS + 1
    if (dias > MAX_DIAS_PERIODO) throw invalido(`Escolha um período de até ${MAX_DIAS_PERIODO} dias.`)

    const agora = new Date()
    let previstos: CicloPrevisto[]
    try {
        previstos = proximosCiclos(config, new Date(Date.parse(inicio) - 45 * DIA_MS), 40)
    } catch {
        throw invalido('O calendário de extração da empresa é inválido (verifique o fuso horário).')
    }
    previstos = previstos.filter(
        c => c.data_referencia >= inicio && c.data_referencia <= fim && c.gatilho_em.getTime() <= agora.getTime(),
    )

    const existentes = await integracaoModel.ciclosNoPeriodo(empresaId, inicio, fim, ex)
    const datasExistentes = new Set(existentes.map(c => c.data_referencia))
    // tempo real não tem fotografia semanal: refazer um período é refazer os fechamentos do mês
    const doTipo = (c: { tipo: string }) => config.modo_extracao !== 'tempo_real' || c.tipo === 'fechamento_mes'
    const novas = previstos.filter(c => !datasExistentes.has(c.data_referencia) && doTipo(c))
    const prontos = existentes.filter(c => c.gatilho_em.getTime() <= agora.getTime() && doTipo(c))

    const doPeriodo = await integracaoModel.fechamentosDosCiclos(prontos.map(c => c.id), unidadeIds, ex)
    const posteriores = await integracaoModel.fechamentosPosteriores(empresaId, unidadeIds, fim, ex)

    const colaboradores = await integracaoModel.colaboradoresPorUnidade(unidadeIds, ex)
    // fechamento novo só para unidade com colaborador ativo (sem ninguém ele seria cancelado)
    const comColaboradores = unidadeIds.filter(u => (colaboradores.get(u) ?? 0) > 0)

    // unidades que ainda não têm fechamento num ciclo existente: o fechamento será criado
    const temFechamento = new Set(doPeriodo.map(f => `${f.ciclo_id}:${f.unidade_id}`))
    const faltando = prontos.flatMap(c => comColaboradores.filter(u => !temFechamento.has(`${c.id}:${u}`)))

    const livres = (lista: FechamentoPlano[]) => lista.filter(f => f.status !== 'processando')
    const reabrirPeriodo = livres(doPeriodo)
    const reabrirPosteriores = livres(posteriores)
    const ignorados = doPeriodo.length + posteriores.length - reabrirPeriodo.length - reabrirPosteriores.length

    const semanas = new Map<string, SemanaPlano>()
    for (const c of novas) semanas.set(c.data_referencia, { ...semana(c), nova: true, dependente: false })
    for (const c of prontos) semanas.set(c.data_referencia, { ...semana(c), nova: false, dependente: false })
    for (const f of posteriores) {
        if (!semanas.has(f.data_referencia)) semanas.set(f.data_referencia, { ...semana(f), nova: false, dependente: true })
    }

    // estimativa: 1 chamada por colaborador ativo em cada fechamento que será (re)feito
    const unidadesTrabalho = [
        ...novas.flatMap(() => comColaboradores),
        ...faltando,
        ...reabrirPeriodo.map(f => f.unidade_id),
        ...reabrirPosteriores.map(f => f.unidade_id),
    ]
    const chamadas = unidadesTrabalho.reduce((soma, u) => soma + (colaboradores.get(u) ?? 0), 0)
    const cota = config.cota_calcular_por_hora

    return {
        comColaboradores,
        novas,
        prontos,
        reabrirIds: [...reabrirPeriodo, ...reabrirPosteriores].map(f => f.id),
        resumo: {
            semanas: [...semanas.values()].sort((a, b) => a.data_referencia.localeCompare(b.data_referencia)),
            fechamentos: novas.length * comColaboradores.length + faltando.length + reabrirPeriodo.length,
            dependentes: reabrirPosteriores.length,
            ignorados_em_processamento: ignorados,
            colaboradores_estimados: unidadeIds.reduce((soma, u) => soma + (colaboradores.get(u) ?? 0), 0),
            chamadas_estimadas: chamadas,
            horas_estimadas: Math.round((chamadas / cota) * 10) / 10,
        },
    }
}

/** Janela de datas de quem pede: só a equipe puxa períodos antigos. */
const janelaDoAtor = (req: FastifyRequest) => (req.usuario.tipo === 'equipe' ? null : JANELA_CLIENTE_DIAS)

function semana(c: { data_referencia: string; periodo_inicio: string; tipo: 'semanal' | 'fechamento_mes' }) {
    return { data_referencia: c.data_referencia, periodo_inicio: c.periodo_inicio, tipo: c.tipo }
}

export async function status(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaIntegracaoQuerySchema.parse(req.query)
    const { empresaId, unidades } = await escopo(req, empresa_id)

    const unidadeIds = unidades.map(u => u.id)
    const [empresa, worker, fila, rotas, cota, config, aoVivo] = await Promise.all([
        integracaoModel.empresa(empresaId),
        integracaoModel.worker(),
        integracaoModel.fila(empresaId, unidadeIds),
        fechamentosModel.usoCota(empresaId),
        fechamentosModel.limiteCota(empresaId),
        configuracoesModel.buscar(empresaId),
        tempoRealModel.resumoEmpresa(empresaId, unidadeIds),
    ])
    if (!empresa) throw naoEncontrado('Empresa não encontrada.')

    let elegiveis = 0
    if (config) {
        try {
            const { periodo_inicio, hoje } = periodoDeHoje(config)
            elegiveis = await tempoRealModel.contarElegiveis(empresaId, periodo_inicio, hoje)
        } catch {
            // fuso inválido: sem estimativa
        }
    }

    res.send({
        tempo_real: {
            ativo: config?.modo_extracao === 'tempo_real',
            ...aoVivo,
            minutos_por_rodada: minutosPorRodada(elegiveis, config?.cota_calcular_por_hora ?? LIMITE_SECULLUM_POR_HORA),
        },
        empresa,
        worker: { online: worker?.online ?? false, visto_em: worker?.visto_em ?? null, status: worker?.status ?? null },
        cota: {
            usadas_ultima_hora: rotas
                .filter(r => r.rota.toLowerCase().startsWith('calcular'))
                .reduce((soma, r) => soma + r.usadas, 0),
            limite_por_hora: cota ?? LIMITE_SECULLUM_POR_HORA,
        },
        fila,
        unidades,
    })
}

/** Tempo real: põe os colaboradores do escopo no começo da fila (a cota continua valendo). */
export async function atualizarTempoReal(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaIntegracaoQuerySchema.parse(req.query)
    const { motivo } = pedirCadastrosSchema.parse(req.body ?? {})
    const { empresaId, unidades } = await escopo(req, empresa_id)

    const config = await configuracoesModel.buscar(empresaId)
    if (config?.modo_extracao !== 'tempo_real') throw invalido('A empresa não está em tempo real.')
    if (unidades.length === 0) throw invalido('Você não tem unidades nesta empresa.')

    const { periodo_inicio, hoje } = periodoDeHoje(config)
    const resultado = await withTransaction(async client => {
        const colaboradores = await tempoRealModel.priorizar(
            empresaId,
            unidades.map(u => u.id),
            periodo_inicio,
            hoje,
            client,
        )
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId,
                acao: 'integracao.tempo_real_forcado',
                entidade: 'empresas',
                entidadeId: empresaId,
                dados: { motivo: motivo || null, colaboradores, unidade_ids: unidades.map(u => u.id) },
                ip: req.ip,
            },
            client,
        )
        return colaboradores
    })

    res.code(202).send({ colaboradores: resultado, minutos_estimados: minutosPorRodada(resultado, config.cota_calcular_por_hora) })
}

/**
 * Atualização dos dados → "Forçar sincronização": pede tudo de uma vez para a próxima
 * rodada do worker (~1 min): cadastros (unidades e colaboradores), batidas e, no tempo
 * real, todos os colaboradores no início da fila. As fotografias publicadas não mudam.
 */
export async function forcarSincronizacao(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaIntegracaoQuerySchema.parse(req.query)
    const { motivo } = pedirCadastrosSchema.parse(req.body ?? {})
    const { empresaId, unidades } = await escopo(req, empresa_id)

    const dadosEmpresa = await integracaoModel.empresa(empresaId)
    if (!dadosEmpresa) throw naoEncontrado('Empresa não encontrada.')
    if (!dadosEmpresa.credenciais_configuradas) {
        throw invalido('A integração com a FriPonto ainda não está configurada para esta empresa.')
    }

    const config = await configuracoesModel.buscar(empresaId)
    const tempoReal = config?.modo_extracao === 'tempo_real' && unidades.length > 0 ? config : null
    // cadastros já na fila: não pede de novo, só o resto
    const cadastrosPendentes = await integracaoModel.sincronizacaoPendente(empresaId)

    const resultado = await withTransaction(async client => {
        const cadastrosEm = cadastrosPendentes ?? (await integracaoModel.solicitarSincronizacao(empresaId, client))
        if (!cadastrosEm) throw invalido('Empresa inativa ou não encontrada.')
        await batidasModel.liberarImportacao(empresaId, client)

        let colaboradores: number | null = null
        if (tempoReal) {
            const { periodo_inicio, hoje } = periodoDeHoje(tempoReal)
            colaboradores = await tempoRealModel.priorizar(empresaId, unidades.map(u => u.id), periodo_inicio, hoje, client)
        }

        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId,
                acao: 'integracao.sincronizacao_forcada',
                entidade: 'empresas',
                entidadeId: empresaId,
                dados: { motivo: motivo || null, colaboradores, cadastros_ja_pendentes: Boolean(cadastrosPendentes) },
                ip: req.ip,
            },
            client,
        )
        return { cadastrosEm, colaboradores }
    })

    res.code(202).send({
        cadastros: { solicitado_em: resultado.cadastrosEm, ja_pendente: Boolean(cadastrosPendentes) },
        batidas: true,
        tempo_real:
            tempoReal && resultado.colaboradores !== null
                ? {
                      colaboradores: resultado.colaboradores,
                      minutos_estimados: minutosPorRodada(resultado.colaboradores, tempoReal.cota_calcular_por_hora),
                  }
                : null,
    })
}

export async function pedirCadastros(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaIntegracaoQuerySchema.parse(req.query)
    const { motivo } = pedirCadastrosSchema.parse(req.body ?? {})
    const empresaId = exigirEmpresa(req.usuario, empresa_id)

    // já há uma sincronização na fila: não pede (nem registra) de novo
    const pendente = await integracaoModel.sincronizacaoPendente(empresaId)
    if (pendente) return res.code(202).send({ solicitado_em: pendente, ja_pendente: true })

    const solicitadoEm = await withTransaction(async client => {
        const quando = await integracaoModel.solicitarSincronizacao(empresaId, client)
        if (!quando) throw invalido('Empresa inativa ou não encontrada.')
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId,
                acao: 'sincronizacao.solicitada',
                entidade: 'empresas',
                entidadeId: empresaId,
                dados: { motivo: motivo || null },
                ip: req.ip,
            },
            client,
        )
        return quando
    })

    res.code(202).send({ solicitado_em: solicitadoEm })
}

export async function previaDados(req: FastifyRequest, res: FastifyReply) {
    const q = previaDadosQuerySchema.parse(req.query)
    const { empresaId, unidades } = await escopo(req, q.empresa_id)
    const plano = await montarPlano(empresaId, unidadesPedidas(unidades, q.unidade_id), q.inicio, q.fim, db, janelaDoAtor(req))
    res.send(plano.resumo)
}

export async function pedirDados(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaIntegracaoQuerySchema.parse(req.query)
    const body = pedirDadosSchema.parse(req.body)
    const { empresaId, unidades } = await escopo(req, empresa_id)
    const unidadeIds = unidadesPedidas(unidades, body.unidade_id)
    const ator = req.usuario

    const resultado = await withTransaction(async client => {
        const plano = await montarPlano(empresaId, unidadeIds, body.inicio, body.fim, client, janelaDoAtor(req))
        if (plano.resumo.fechamentos + plano.resumo.dependentes === 0) {
            throw invalido('Não há semanas para puxar nesse período (ou todas já estão em processamento).')
        }

        let ciclosCriados = 0
        let fechamentosCriados = 0
        for (const ciclo of plano.novas) {
            const novoId = await criarCiclo(empresaId, ciclo, client)
            if (novoId) ciclosCriados++
            const cicloId = novoId ?? (await integracaoModel.idDoCiclo(empresaId, ciclo.data_referencia, client))
            if (cicloId) fechamentosCriados += await integracaoModel.criarFechamentosPedidos(cicloId, empresaId, plano.comColaboradores, ator, client)
        }
        for (const ciclo of plano.prontos) {
            fechamentosCriados += await integracaoModel.criarFechamentosPedidos(ciclo.id, empresaId, plano.comColaboradores, ator, client)
        }
        const reabertos = await fechamentosModel.reabrirVarios(plano.reabrirIds, ator, client)

        // cadastros atualizados antes da extração (colaborador novo/transferido entra no cálculo)
        await integracaoModel.solicitarSincronizacao(empresaId, client)

        const total = fechamentosCriados + reabertos.length
        const dados = {
            inicio: body.inicio,
            fim: body.fim,
            unidade_ids: unidadeIds,
            motivo: body.motivo || null,
            fechamentos: total - plano.resumo.dependentes,
            dependentes: plano.resumo.dependentes,
            ciclos_criados: ciclosCriados,
        }
        await auditoria.registrar(
            {
                ator,
                empresaId,
                acao: 'integracao.dados_solicitados',
                entidade: 'empresas',
                entidadeId: empresaId,
                dados,
                ip: req.ip,
            },
            client,
        )
        return { fechamentos: total, ciclos_criados: ciclosCriados, dependentes: plano.resumo.dependentes }
    })

    res.code(202).send(resultado)
}

/**
 * Consultado pelo app inteiro de tempos em tempos: se há algo sendo puxado da FriPonto
 * agora (indicador na tela) e, para RH e equipe, as falhas recentes (alertas de erro).
 */
export async function atividade(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaIntegracaoQuerySchema.parse(req.query)
    const empresaId = empresaDoUsuario(req.usuario, empresa_id)
    const veErros = req.usuario.perfil === 'admin' || req.usuario.perfil === 'rh'

    const [tarefas, worker, erros] = await Promise.all([
        integracaoModel.atividade(req.usuario, empresaId),
        integracaoModel.worker(),
        veErros ? integracaoModel.errosRecentes(req.usuario, empresaId) : Promise.resolve([]),
    ])
    const sincronizando = Object.values(tarefas).some(total => total > 0)
    res.send({ sincronizando, tarefas, worker_online: worker?.online ?? false, erros })
}

export async function execucoes(req: FastifyRequest, res: FastifyReply) {
    const q = listaIntegracaoQuerySchema.parse(req.query)
    const { empresaId, unidades } = await escopo(req, q.empresa_id)
    const resultado = await integracaoModel.execucoes(empresaId, unidades.map(u => u.id), q.pagina, q.por_pagina)
    res.send({ ...resultado, pagina: q.pagina, por_pagina: q.por_pagina })
}

function descrever(r: RegistroHistorico) {
    const d = r.dados ?? {}
    const fechamento = [r.unidade_nome, r.data_referencia && dataBr(r.data_referencia)].filter(Boolean).join(' ')
    switch (r.acao) {
        case 'sincronizacao.solicitada':
            return 'Pediu sincronização de cadastros (unidades e colaboradores)'
        case 'integracao.dados_solicitados': {
            const unidades = Array.isArray(d.unidade_ids) ? d.unidade_ids.length : 0
            const dependentes = Number(d.dependentes ?? 0)
            return (
                `Pediu dados de ${dataBr(String(d.inicio))} a ${dataBr(String(d.fim))}` +
                ` (${unidades} ${unidades === 1 ? 'unidade' : 'unidades'})` +
                (dependentes ? ` · ${dependentes} semana(s) seguinte(s) refeita(s) junto` : '')
            )
        }
        case 'fechamento.reprocessado':
            return `Reprocessou o fechamento ${fechamento}`.trim()
        case 'fechamento.publicado_forcado':
            return `Publicou mesmo assim o fechamento ${fechamento}`.trim()
        case 'integracao.tempo_real_forcado': {
            const total = Number(d.colaboradores ?? 0)
            return `Pediu atualização imediata do tempo real (${total} ${total === 1 ? 'colaborador' : 'colaboradores'})`
        }
        case 'integracao.sincronizacao_forcada': {
            const total = d.colaboradores == null ? null : Number(d.colaboradores)
            return (
                'Forçou a sincronização (cadastros e batidas' +
                (total === null ? ')' : `, tempo real de ${total} ${total === 1 ? 'colaborador' : 'colaboradores'})`)
            )
        }
        case 'ciclo.gatilho_ajustado':
            return `Ajustou o agendamento da semana ${r.data_referencia ? dataBr(r.data_referencia) : ''}`.trim()
        default:
            return r.acao
    }
}

export async function historico(req: FastifyRequest, res: FastifyReply) {
    const q = listaIntegracaoQuerySchema.parse(req.query)
    const empresaId = exigirEmpresa(req.usuario, q.empresa_id)
    // gestor: só o que ele fez e o que envolve unidades dele
    const filtroGestor =
        req.usuario.perfil === 'gestor'
            ? { clienteId: req.usuario.id, unidadeIds: (await integracaoModel.unidadesDoEscopo(req.usuario, empresaId)).map(u => u.id) }
            : null
    const resultado = await integracaoModel.historico(empresaId, q.pagina, q.por_pagina, filtroGestor)
    res.send({
        itens: resultado.itens.map(r => ({
            id: r.id,
            criado_em: r.criado_em,
            acao: r.acao,
            descricao: descrever(r),
            ator: r.ator,
            dados: r.dados,
        })),
        total: resultado.total,
        pagina: q.pagina,
        por_pagina: q.por_pagina,
    })
}
