import { Pool, type PoolClient, type QueryResult } from 'pg'
import { env } from '../../src/config/env'

// Substitui src/db/database nos testes de API: tudo roda numa única transação desfeita no final.
const pool = new Pool({ connectionString: env.SUPABASE_CONNECTION_STRING, max: 1 })
let cliente: PoolClient | null = null
let fila: Promise<unknown> = Promise.resolve()
let contador = 0

async function conexao() {
    if (!cliente) {
        cliente = await pool.connect()
        await cliente.query('BEGIN')
    }
    return cliente
}

function emFila<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = fila.then(fn, fn)
    fila = resultado.catch(() => undefined)
    return resultado
}

async function comSavepoint<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await conexao()
    const nome = `sp_api_${++contador}`
    await client.query(`SAVEPOINT ${nome}`)
    try {
        const resultado = await fn(client)
        await client.query(`RELEASE SAVEPOINT ${nome}`)
        return resultado
    } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${nome}`)
        throw err
    }
}

export const db = {
    query: (texto: string, valores?: unknown[]): Promise<QueryResult> =>
        emFila(() => comSavepoint(client => client.query(texto, valores))),
    end: async () => {
        if (cliente) {
            await cliente.query('ROLLBACK')
            cliente.release()
            cliente = null
        }
        await pool.end()
    },
}

export type Executor = PoolClient

export function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, _ex?: unknown) {
    return emFila(() => comSavepoint(fn))
}
