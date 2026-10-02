import { db } from './db/database'
import { iniciarWorker } from './jobs/worker'

const worker = iniciarWorker({ umaVez: process.argv.includes('--uma-vez') })

process.on('SIGINT', () => void worker.parar())
process.on('SIGTERM', () => void worker.parar())

worker.terminou
    .then(() => db.end())
    .catch(async err => {
        console.error(err)
        await db.end().catch(() => {})
        process.exit(1)
    })
