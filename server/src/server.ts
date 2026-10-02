import { buildApp } from './app'
import { env } from './config/env'
import { db } from './db/database'
import { iniciarWorker } from './jobs/worker'

async function start() {
    const app = await buildApp()

    await db.query('SELECT 1')
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`API rodando na porta ${env.PORT}`)

    // Em produção a API e o worker rodam no mesmo processo; no dev o worker fica em `npm run dev:worker`
    const worker = env.WORKER_EMBUTIDO ? iniciarWorker() : null
    worker?.terminou.catch(err => app.log.error(err, 'worker embutido parou'))

    const encerrar = async () => {
        await Promise.all([app.close(), worker?.parar().catch(() => {})])
        await db.end()
        process.exit(0)
    }
    process.on('SIGINT', encerrar)
    process.on('SIGTERM', encerrar)
}

start().catch(err => {
    console.error(err)
    process.exit(1)
})
