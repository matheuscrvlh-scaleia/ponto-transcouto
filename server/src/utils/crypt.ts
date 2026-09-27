import crypto from 'node:crypto'

const algorithm = 'aes-256-gcm';

export async function encrypt(data: string | number) {
    const iv = crypto.randomBytes(16);
    console.log(iv)

    const cipher = crypto.createCipheriv(
        algorithm,
        process.env.ENCRYPTION_KEY,
        iv
    );

    let encrypted = cipher.update(data, 'utf8', 'hex')

    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag()
    console.log(`${encrypted}:${iv}:${authTag}`)

    return (`${encrypted}:${iv}:${authTag}`)
}

export async function decrypt(data: string) {
    const { encrypted, iv, authTag } = data.split(':')
    console.log({
        encrypt,
        iv,
        authTag
    })

    const decipher = crypto.createCipheriv(
        algorithm,
        process.env.ENCRYPTION_KEY,
        Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(
        Buffer.from(authTag, 'hex')
    );

    let decrypted = decipher.update(
        encrypted,
        'hex',
        'utf8'
    );

    decrypted += decipher.final('utf8');

    return decrypted
}