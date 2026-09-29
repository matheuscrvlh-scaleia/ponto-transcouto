import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from './database'

const pasta = path.join(__dirname, 'migrations')
const simular = process.argv.includes('--dry-run')

async function migrar() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            nome text PRIMARY KEY,
            aplicada_em timestamptz NOT NULL DEFAULT now()
        )
    `)
    await db.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY')

    const aplicadas = new Set((await db.query('SELECT nome FROM schema_migrations')).rows.map(r => r.nome))
    const arquivos = (await readdir(pasta)).filter(a => a.endsWith('.sql')).sort()
    const pendentes = arquivos.filter(a => !aplicadas.has(a))

    if (pendentes.length === 0) {
        console.log('Nenhuma migration pendente.')
        return
    }

    for (const arquivo of pendentes) {
        const sql = await readFile(path.join(pasta, arquivo), 'utf8')
        const client = await db.connect()
        try {
            await client.query('BEGIN')
            await client.query(sql)
            await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo])
            await client.query(simular ? 'ROLLBACK' : 'COMMIT')
            console.log(`${simular ? '[dry-run] ok' : 'aplicada'}: ${arquivo}`)
        } catch (err) {
            await client.query('ROLLBACK')
            throw new Error(`Falha em ${arquivo}: ${(err as Error).message}`)
        } finally {
            client.release()
        }
    }
}

migrar()
    .catch(err => {
        console.error(err.message)
        process.exitCode = 1
    })
    .finally(() => db.end())
