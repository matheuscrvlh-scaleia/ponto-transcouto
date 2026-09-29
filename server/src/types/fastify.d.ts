import 'fastify'
import type { UsuarioAutenticado } from './auth.types'

declare module 'fastify' {
    interface FastifyRequest {
        usuario: UsuarioAutenticado
    }
}
