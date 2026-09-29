import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    SUPABASE_CONNECTION_STRING: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    TRUST_PROXY: z.stringbool().default(false),
    SECULLUM_AUTH_URL: z.string().url().default('https://autenticador.secullum.com.br'),
    SECULLUM_API_URL: z.string().url().default('https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna'),
    WORKER_INTERVALO_MS: z.coerce.number().default(60000),
})

const resultado = schema.safeParse(process.env)

if (!resultado.success) {
    console.error('Variáveis de ambiente inválidas:', z.flattenError(resultado.error).fieldErrors)
    process.exit(1)
}

export const env = resultado.data
