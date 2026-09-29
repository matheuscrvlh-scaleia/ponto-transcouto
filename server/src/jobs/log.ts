export type Log = {
    info(mensagem: string): void
    erro(mensagem: string): void
}

export const logConsole: Log = {
    info: mensagem => console.log(`[worker ${new Date().toISOString()}] ${mensagem}`),
    erro: mensagem => console.error(`[worker ${new Date().toISOString()}] ${mensagem}`),
}

export const logSilencioso: Log = { info: () => {}, erro: () => {} }
