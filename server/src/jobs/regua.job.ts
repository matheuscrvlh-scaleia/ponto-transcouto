import { db, type Executor } from '../db/database'
import {
    cancelarFechamentosSemUnidade,
    completarFechamentosFuturos,
    criarCiclo,
    criarFechamentosDoCiclo,
    empresasParaRegua,
} from '../models/extracao.models'
import { proximosCiclos } from '../services/calendario.service'
import type { Log } from './log'

const DIA_MS = 86400000
export const TOLERANCIA_ATRASO_MS = 2 * DIA_MS
export const HORIZONTE_MS = 14 * DIA_MS

export async function executarRegua(log: Log, ex: Executor = db, agora = new Date()) {
    let ciclosCriados = 0

    for (const empresa of await empresasParaRegua(ex)) {
        try {
            const limite = agora.getTime() + HORIZONTE_MS
            const ciclos = proximosCiclos(empresa, new Date(agora.getTime() - TOLERANCIA_ATRASO_MS), 6)
                .filter(c => c.gatilho_em.getTime() <= limite)

            for (const ciclo of ciclos) {
                const cicloId = await criarCiclo(empresa.empresa_id, ciclo, ex)
                if (cicloId === null) continue
                ciclosCriados++
                await criarFechamentosDoCiclo(cicloId, ex)
                log.info(`régua: ciclo ${ciclo.tipo} ${ciclo.data_referencia} criado para empresa ${empresa.empresa_id}`)
            }

            await completarFechamentosFuturos(empresa.empresa_id, ex)
            await cancelarFechamentosSemUnidade(empresa.empresa_id, ex)
        } catch (err) {
            log.erro(`régua: empresa ${empresa.empresa_id}: ${(err as Error).message}`)
        }
    }

    return { ciclosCriados }
}
