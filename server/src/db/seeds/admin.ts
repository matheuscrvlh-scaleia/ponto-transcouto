import { parseArgs } from 'node:util'
import { db } from '../database'
import { gerarSenhaTemporaria, hashPassword } from '../../utils/hash'

const { values } = parseArgs({
    options: {
        email: { type: 'string' },
        nome: { type: 'string', default: 'Administrador Scale' },
        senha: { type: 'string' },
    },
})

async function criarAdmin() {
    if (!values.email) throw new Error('Uso: npm run seed:admin -- --email admin@scaleia.ai [--nome "Nome"] [--senha "..."]')

    const senha = values.senha ?? gerarSenhaTemporaria()
    const { rows } = await db.query<{ id: number }>(
        `INSERT INTO usuarios (nome, email, senha, perfil, empresa_id, ativo, deve_trocar_senha)
         VALUES ($1, lower($2), $3, 'admin', NULL, true, $4)
         ON CONFLICT (email) DO UPDATE
            SET perfil = 'admin', empresa_id = NULL, senha = EXCLUDED.senha,
                ativo = true, deve_trocar_senha = EXCLUDED.deve_trocar_senha,
                token_versao = usuarios.token_versao + 1
         RETURNING id`,
        [values.nome, values.email, await hashPassword(senha), !values.senha],
    )

    console.log(`Admin #${rows[0].id} pronto: ${values.email}`)
    if (!values.senha) console.log(`Senha temporária (trocar no primeiro acesso): ${senha}`)
}

criarAdmin()
    .catch(err => {
        console.error(err.message)
        process.exitCode = 1
    })
    .finally(() => db.end())
