import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import { colunaInformativa } from '../integrations/secullum/parser'
import * as mapeamentoModel from '../models/admin-mapeamento.models'
import * as auditoria from '../models/auditoria.models'
import { solicitarRecalculo } from '../models/recalculo.models'
import { colunasDasMensagensDeErro } from '../services/calculo-horas.service'
import { exigirEmpresa } from '../services/escopo.service'
import { salvarMapeamentoSchema } from '../types/admin-mapeamento.types'
import { empresaQuerySchema } from '../types/comum.types'

export async function obter(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaQuerySchema.parse(req.query)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)

    const [mapeamento, colunasRegistros, mensagens] = await Promise.all([
        mapeamentoModel.listar(empresaId),
        mapeamentoModel.colunasDosRegistrosRecentes(empresaId),
        mapeamentoModel.errosDeMapeamentoRecentes(empresaId),
    ])

    const colunasErro = colunasDasMensagensDeErro(mensagens)
    // Data e Entrada/Saída N (batidas) não têm horas: o cálculo já ignora, não precisam de mapeamento
    const colunas_detectadas = [...new Set([...colunasRegistros, ...colunasErro])]
        .filter(coluna => !colunaInformativa(coluna))
        .sort((a, b) => a.localeCompare(b))
    res.send({ mapeamento, colunas_detectadas })
}

export async function salvar(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaQuerySchema.parse(req.query)
    const { mapeamento } = salvarMapeamentoSchema.parse(req.body)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)

    const salvo = await withTransaction(async client => {
        const anterior = await mapeamentoModel.listar(empresaId, client)
        await mapeamentoModel.substituir(empresaId, mapeamento, client)
        const atual = await mapeamentoModel.listar(empresaId, client)
        // o mapeamento novo vale também para os dados já extraídos (os totais da FriPonto ficam gravados)
        const mudou = JSON.stringify(atual) !== JSON.stringify(anterior)
        if (mudou) await solicitarRecalculo(empresaId, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId,
                acao: 'mapeamento_colunas.alterado',
                entidade: 'mapeamento_colunas',
                entidadeId: empresaId,
                dados: { antes: anterior, depois: mapeamento, recalculo_solicitado: mudou },
                ip: req.ip,
            },
            client,
        )
        return atual
    })

    res.send({ mapeamento: salvo })
}
