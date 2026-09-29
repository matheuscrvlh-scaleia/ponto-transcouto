import { hash, compare } from 'bcryptjs'
import crypto from 'node:crypto'

const HASH_FICTICIO = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.X8P6bQbI1Z0Ow5y8K1u5r5Q5r5Q.'

export async function hashPassword(password: string) {
    return hash(password, 10)
}

export async function verifyPassword(password: string, hashedPassword: string | null) {
    return compare(password, hashedPassword ?? HASH_FICTICIO)
}

export function gerarSenhaTemporaria() {
    return crypto.randomBytes(9).toString('base64url')
}
