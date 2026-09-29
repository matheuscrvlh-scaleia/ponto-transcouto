import { db, withTransaction, type Executor } from '../db/database'
import { calcularTotais } from '../integrations/secullum/calculo'
import { ROTA_TOTAIS, type ClienteSecullum } from '../integrations/secullum/cliente'
import { SecullumError, type OpcoesCliente, type TotaisSecullum } from '../integrations/secullum/tipos'
import {
    buscarConfigExtracao,
    buscarMapeamento,
    buscarRegistroAnterior,
    chamadasNaUltimaHora,
    colaboradoresElegiveis,
    concluirChamada,
    criarExecucao,
    definirTotalColaboradores,
    devolverFechamento,
    finalizarExecucao,
    gravarRegistro,
    heartbeatFechamento,
    interromperExecucoesAbertas,
    encerrarFechamento,
    publicarFechamento,
    registrarErro,
    reivindicarFechamento,
    reservarChamada,
    saldoPeriodosAnteriores,
    somarProgresso,
    travarEmpresa,
    type ColaboradorElegivel,
    type EtapaErro,
    type FechamentoReivindicado,
} from '../models/extracao.models'
import { buscarCredenciais, registrarChamadaApi } from '../models/sincronizacao.models'
import { calcularHoras, mensagensErroMapeamento, type ItemMapeamento, type RegraPagas } from '../services/calculo-horas.service'
import { decidirPublicacao } from '../services/publicacao.service'
import { clienteDaEmpresa } from './cliente-empresa'
import type { Log } from './log'

export type OpcoesExtracao = {
    log: Log
    ex?: Executor
    deveParar?: () => boolean
    aoProgredir?: () => Promise<void>
    opcoesCliente?: Omit<OpcoesCliente, 'ganchos'>
}

type Desfecho =
    | { tipo: 'completo' }
    | { tipo: 'abortado', fatal: boolean, mensagem: string }
    | { tipo: 'cota', liberaEm: Date }
    | { tipo: 'parada' }
    | { tipo: 'perdido' }

class CotaEsgotada extends Error {
    constructor(public liberaEm: Date) {
        super(`Cota de ${ROTA_TOTAIS} esgotada até ${liberaEm.toISOString()}.`)
    }
}

const UMA_HORA_MS = 60 * 60 * 1000

async function reservarCota(empresaId: number, execucaoId: number, cota: number, ex: Executor) {
    return withTransaction(async client => {
        await travarEmpresa(empresaId, client)
        const uso = await chamadasNaUltimaHora(empresaId, ROTA_TOTAIS, client)
        if (uso.total >= cota) {
            const base = uso.mais_antiga ? new Date(uso.mais_antiga).getTime() : Date.now()
            throw new CotaEsgotada(new Date(base + UMA_HORA_MS + 1000))
        }
        return reservarChamada(empresaId, execucaoId, ROTA_TOTAIS, client)
    }, ex)
}

type Contexto = {
    f: FechamentoReivindicado
    execucaoId: number
    ex: Executor
    op: OpcoesExtracao
}

async function erro(ctx: Contexto, etapa: EtapaErro, mensagem: string, colaboradorId: number | null, httpStatus?: number) {
    await registrarErro({ execucaoId: ctx.execucaoId, colaboradorId, etapa, httpStatus, mensagem }, ctx.ex)
}

function prepararCliente(ctx: Contexto, credenciais: NonNullable<Awaited<ReturnType<typeof buscarCredenciais>>>, cota: number) {
    let reserva: string | null = null
    return clienteDaEmpresa(credenciais, {
        ...ctx.op.opcoesCliente,
        ganchos: {
            antes: async rota => {
                if (rota === ROTA_TOTAIS) reserva = await reservarCota(ctx.f.empresa_id, ctx.execucaoId, cota, ctx.ex)
            },
            depois: async (rota, status, duracaoMs) => {
                if (rota === ROTA_TOTAIS && reserva) {
                    await concluirChamada(reserva, status, duracaoMs, ctx.ex)
                    reserva = null
                } else {
                    await registrarChamadaApi({ empresaId: ctx.f.empresa_id, execucaoId: ctx.execucaoId, rota, status, duracaoMs }, ctx.ex)
                }
            },
        },
    })
}

async function calcularColaborador(
    ctx: Contexto, cliente: ClienteSecullum, col: ColaboradorElegivel,
): Promise<{ dados: TotaisSecullum } | { comErro: true } | { desfecho: Desfecho }> {
    try {
        const dados = await calcularTotais(cliente, {
            cpf: col.cpf,
            dataInicial: ctx.f.periodo_inicio,
            dataFinal: ctx.f.data_referencia,
        })
        return { dados }
    } catch (err) {
        if (err instanceof CotaEsgotada) return { desfecho: { tipo: 'cota', liberaEm: err.liberaEm } }
        if (!(err instanceof SecullumError)) {
            await erro(ctx, 'calcular', (err as Error).message, col.id)
            return { comErro: true }
        }
        if (err.tipo === 'rate_limit') {
            const espera = err.retryAfterMs ?? UMA_HORA_MS
            await erro(ctx, 'calcular', err.message, col.id, err.status)
            return { desfecho: { tipo: 'cota', liberaEm: new Date(Date.now() + espera) } }
        }
        if (err.tipo === 'auth' || err.tipo === 'nao_encontrado') {
            await erro(ctx, 'autenticacao', err.message, null, err.status)
            return { desfecho: { tipo: 'abortado', fatal: false, mensagem: err.message } }
        }
        if (err.tipo === 'formato') {
            await erro(ctx, 'mapeamento', err.message, col.id)
            return { desfecho: { tipo: 'abortado', fatal: true, mensagem: err.message } }
        }
        await erro(ctx, 'calcular', err.message, col.id, err.status)
        return { comErro: true }
    }
}

async function extrairColaboradores(ctx: Contexto, pendentes: ColaboradorElegivel[]): Promise<Desfecho> {
    const { f, ex } = ctx
    const credenciais = await buscarCredenciais(f.empresa_id, ex)
    const config = await buscarConfigExtracao(f.empresa_id, ex)
    if (!credenciais || !config) return { tipo: 'abortado', fatal: true, mensagem: 'Empresa ou configuração não encontrada.' }
    if (pendentes.length === 0) return { tipo: 'completo' }

    const mapeamento: ItemMapeamento[] = await buscarMapeamento(f.empresa_id, ex)
    const regra: RegraPagas = {
        origem: config.origem_horas_pagas,
        teto_minutos: f.teto_aplicado_minutos,
        periodicidade: f.teto_periodicidade_aplicada,
    }

    let cliente: ClienteSecullum
    try {
        cliente = prepararCliente(ctx, credenciais, config.cota_calcular_por_hora)
    } catch (err) {
        await erro(ctx, 'autenticacao', (err as Error).message, null)
        return { tipo: 'abortado', fatal: false, mensagem: (err as Error).message }
    }

    for (const col of pendentes) {
        if (ctx.op.deveParar?.()) return { tipo: 'parada' }
        if (!(await heartbeatFechamento(f, ex))) return { tipo: 'perdido' }
        await ctx.op.aoProgredir?.()

        const chamada = await calcularColaborador(ctx, cliente, col)
        if ('desfecho' in chamada) return chamada.desfecho
        if ('comErro' in chamada) {
            await somarProgresso(ctx.execucaoId, 0, 1, ex)
            continue
        }

        let resultado: ReturnType<typeof calcularHoras>
        try {
            const anterior = await buscarRegistroAnterior({
                colaboradorId: col.id, empresaId: f.empresa_id, periodoInicio: f.periodo_inicio, dataReferencia: f.data_referencia,
            }, ex)
            const saldoAnterior = await saldoPeriodosAnteriores({
                colaboradorId: col.id, empresaId: f.empresa_id, periodoInicio: f.periodo_inicio,
            }, ex)
            resultado = calcularHoras({ dados: chamada.dados, mapeamento, regra, anterior, saldoPeriodosAnteriores: saldoAnterior })
        } catch (err) {
            await erro(ctx, 'mapeamento', (err as Error).message, col.id)
            return { tipo: 'abortado', fatal: true, mensagem: (err as Error).message }
        }

        if (!resultado.ok) {
            for (const mensagem of mensagensErroMapeamento(resultado.erro)) await erro(ctx, 'mapeamento', mensagem, col.id)
            return { tipo: 'abortado', fatal: true, mensagem: 'Erro de mapeamento de colunas do Secullum.' }
        }

        try {
            const valores = resultado.valores
            await withTransaction(client => gravarRegistro(f.id, col.id, valores, chamada.dados, client), ex)
            await somarProgresso(ctx.execucaoId, 1, 0, ex)
        } catch (err) {
            await erro(ctx, 'gravacao', (err as Error).message, col.id)
            await somarProgresso(ctx.execucaoId, 0, 1, ex)
        }
    }

    return { tipo: 'completo' }
}

const MENSAGEM_PERDIDO = 'Fechamento reaberto ou reassumido por outra execução; resultado descartado.'

async function encerrar(
    ctx: Contexto,
    alterarFechamento: (client: Executor) => Promise<boolean>,
    status: 'sucesso' | 'falhou' | 'interrompida',
    mensagem: string | null,
) {
    return withTransaction(async client => {
        const temPosse = await alterarFechamento(client)
        await finalizarExecucao(ctx.execucaoId, temPosse ? status : 'interrompida', temPosse ? mensagem : MENSAGEM_PERDIDO, client)
        if (!temPosse) ctx.op.log.erro(`fechamento ${ctx.f.id}: ${MENSAGEM_PERDIDO}`)
        return temPosse
    }, ctx.ex)
}

async function concluir(ctx: Contexto, desfecho: Desfecho) {
    const { f, ex, op } = ctx

    if (desfecho.tipo === 'perdido') {
        await encerrar(ctx, async () => false, 'interrompida', null)
        return
    }

    if (desfecho.tipo === 'parada' || desfecho.tipo === 'cota') {
        const retomaEm = desfecho.tipo === 'cota' ? desfecho.liberaEm : new Date()
        const mensagem = desfecho.tipo === 'cota'
            ? `Cota de Calcular esgotada; retoma em ${retomaEm.toISOString()}.`
            : 'Worker encerrado; retomada automática.'
        if (await encerrar(ctx, client => devolverFechamento(f, retomaEm, true, client), 'interrompida', mensagem)) {
            op.log.info(`fechamento ${f.id}: ${mensagem}`)
        }
        return
    }

    const elegiveis = await colaboradoresElegiveis(f.id, ex)
    const comRegistro = elegiveis.filter(c => c.feito).length
    const erroFatal = desfecho.tipo === 'abortado' && desfecho.fatal
    const decisao = decidirPublicacao({ totalColaboradores: elegiveis.length, comRegistro, tentativas: f.tentativas, erroFatal })
    const detalhe = desfecho.tipo === 'abortado' ? desfecho.mensagem : `${comRegistro} de ${elegiveis.length} colaboradores extraídos.`

    if (decisao.status === 'sucesso') {
        if (await encerrar(ctx, client => publicarFechamento(f, client), 'sucesso', null)) {
            op.log.info(`fechamento ${f.id} publicado (${comRegistro} colaboradores).`)
        }
    } else if (decisao.status === 'cancelado') {
        const mensagem = 'Nenhum colaborador elegível na unidade; fechamento cancelado sem publicar.'
        if (await encerrar(ctx, client => encerrarFechamento(f, 'cancelado', client), 'sucesso', mensagem)) {
            op.log.info(`fechamento ${f.id}: ${mensagem}`)
        }
    } else if (decisao.status === 'pendente') {
        const mensagem = `${detalhe} Nova tentativa em ${decisao.proximaTentativaEm.toISOString()}.`
        if (await encerrar(ctx, client => devolverFechamento(f, decisao.proximaTentativaEm, false, client), 'falhou', mensagem)) {
            op.log.erro(`fechamento ${f.id} incompleto: ${detalhe}`)
        }
    } else if (await encerrar(ctx, client => encerrarFechamento(f, 'falhou', client), 'falhou', detalhe)) {
        op.log.erro(`fechamento ${f.id} falhou: ${detalhe}`)
    }
}

export async function processarProximoFechamento(op: OpcoesExtracao): Promise<boolean> {
    const ex = op.ex ?? db
    const f = await reivindicarFechamento(ex)
    if (!f) return false

    await interromperExecucoesAbertas(f.id, ex)
    const elegiveis = await colaboradoresElegiveis(f.id, ex)
    const feitos = elegiveis.filter(c => c.feito).length
    await definirTotalColaboradores(f, elegiveis.length, ex)
    const execucaoId = await criarExecucao(f.id, elegiveis.length, feitos, ex)
    const ctx: Contexto = { f, execucaoId, ex, op }
    op.log.info(`fechamento ${f.id} (${f.tipo} ${f.data_referencia}, unidade ${f.unidade_id}): ${elegiveis.length - feitos} pendentes`)

    let desfecho: Desfecho
    try {
        desfecho = await extrairColaboradores(ctx, elegiveis.filter(c => !c.feito))
    } catch (err) {
        desfecho = { tipo: 'abortado', fatal: false, mensagem: (err as Error).message }
    }
    await concluir(ctx, desfecho)
    return true
}

export async function executarExtracao(op: OpcoesExtracao) {
    let processados = 0
    while (!op.deveParar?.() && await processarProximoFechamento(op)) processados++
    return processados
}
