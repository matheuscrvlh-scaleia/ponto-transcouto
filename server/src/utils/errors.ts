export class AppError extends Error {
    constructor(public statusCode: number, message: string, public detalhes?: unknown) {
        super(message)
    }
}

export const naoAutorizado = (msg = 'Não autenticado.') => new AppError(401, msg)
export const proibido = (msg = 'Acesso negado.') => new AppError(403, msg)
export const naoEncontrado = (msg = 'Registro não encontrado.') => new AppError(404, msg)
export const conflito = (msg: string) => new AppError(409, msg)
export const invalido = (msg: string, detalhes?: unknown) => new AppError(400, msg, detalhes)
