import type { FastifyReply, FastifyRequest } from 'fastify'
import { ultimoHeartbeat } from '../models/worker.models'

export async function health(_req: FastifyRequest, res: FastifyReply) {
    res.send({ api: 'ok', db: 'ok', worker: { ultimo_heartbeat: await ultimoHeartbeat() } })
}
