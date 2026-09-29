import crypto from 'node:crypto'
import { env } from '../config/env'

const algoritmo = 'aes-256-gcm'
const chave = Buffer.from(env.ENCRYPTION_KEY, 'hex')

export function encrypt(texto: string) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(algoritmo, chave, iv)
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return [iv, tag, cifrado].map(b => b.toString('hex')).join(':')
}

export function decrypt(valor: string) {
    const [iv, tag, cifrado] = valor.split(':').map(p => Buffer.from(p, 'hex'))
    const decipher = crypto.createDecipheriv(algoritmo, chave, iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8')
}
