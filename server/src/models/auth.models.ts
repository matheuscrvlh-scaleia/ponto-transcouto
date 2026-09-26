import { db } from "../db/database";

export async function search(email:string) {
    const result = await db.query(`
        SELECT id, nome, senha FROM usuarios WHERE email = $1
    `,[email])
    return result
}