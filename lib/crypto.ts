import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32

function getKey(): Buffer {
  const keyStr = process.env.ENCRYPTION_KEY || 'neuramail-dev-encryption-key-32ch'
  // Derive a 32-byte key from the string
  return scryptSync(keyStr, 'neuramail-salt', KEY_LENGTH)
}

export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decrypt(encryptedText: string): string {
  const key = getKey()
  const data = Buffer.from(encryptedText, 'base64')
  
  const iv = data.slice(0, 16)
  const authTag = data.slice(16, 32)
  const encrypted = data.slice(32)
  
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
