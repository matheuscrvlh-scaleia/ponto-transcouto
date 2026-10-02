import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

type Executor = { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }

/**
 * Aplica, dentro da transação dos testes (desfeita no final), as migrations que
 * ainda não rodaram no banco: os testes valem para o código atual mesmo antes do deploy.
 */
export async function aplicarMigrationsPendentes(executor: Executor) {
    const pasta = path.join(__dirname, '../src/db/migrations')
    const aplicadas = new Set((await executor.query('SELECT nome FROM schema_migrations')).rows.map(r => r.nome))
    const pendentes = (await readdir(pasta)).filter(a => a.endsWith('.sql') && !aplicadas.has(a)).sort()
    for (const arquivo of pendentes) await executor.query(await readFile(path.join(pasta, arquivo), 'utf8'))
}
