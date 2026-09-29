import { db, type Executor } from '../db/database'

export async function registrarHeartbeat(nome: string, info: Record<string, unknown>, ex: Executor = db) {
    await ex.query(
        `INSERT INTO worker_status (nome, visto_em, info) VALUES ($1, now(), $2)
         ON CONFLICT (nome) DO UPDATE SET visto_em = now(), info = EXCLUDED.info`,
        [nome, JSON.stringify(info)],
    )
}

export async function ultimoHeartbeat() {
    const { rows } = await db.query<{ visto_em: Date | null }>('SELECT max(visto_em) AS visto_em FROM worker_status')
    return rows[0].visto_em
}
