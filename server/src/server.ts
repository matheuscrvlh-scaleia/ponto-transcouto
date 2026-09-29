import { buildApp } from './app'
import { env } from './config/env'
import { db } from './db/database'

async function start() {
    const app = await buildApp()

    await db.query('SELECT 1')
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`API rodando na porta ${env.PORT}`)

    const encerrar = async () => {
        await app.close()
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
