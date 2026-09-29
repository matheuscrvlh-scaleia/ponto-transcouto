import { Pool, type PoolClient } from 'pg'
import { env } from '../config/env'

export const db = new Pool({
    connectionString: env.SUPABASE_CONNECTION_STRING,
    max: 10,
    statement_timeout: 30000,
})

export type Executor = Pool | PoolClient

let savepoints = 0

// Com um client já em transação (worker em teste, por exemplo) usa SAVEPOINT em vez de BEGIN.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, ex: Executor = db): Promise<T> {
    if (ex instanceof Pool) {
        const client = await ex.connect()
        try {
            await client.query('BEGIN')
            const result = await fn(client)
            await client.query('COMMIT')
            return result
        } catch (err) {
            await client.query('ROLLBACK')
            throw err
        } finally {
            client.release()
        }
    }

    const nome = `sp_${++savepoints}`
    await ex.query(`SAVEPOINT ${nome}`)
    try {
        const result = await fn(ex)
        await ex.query(`RELEASE SAVEPOINT ${nome}`)
        return result
    } catch (err) {
        await ex.query(`ROLLBACK TO SAVEPOINT ${nome}`)
        throw err
    }
}
