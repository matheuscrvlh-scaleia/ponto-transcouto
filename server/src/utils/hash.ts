import { hash, compare } from "bcryptjs";

export async function hashPassword(password: string) {
    const result = await hash(password, 8);
    return result
}

export async function verifyPassword(password:string, hashedPassword: string) {
    const result = await compare(password, hashedPassword)
    return result
}