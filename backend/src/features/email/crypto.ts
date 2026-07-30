// ============================================
// DAYA IA — Cifrado de credenciales (AES-256-GCM)
// Para guardar contraseñas IMAP sin dejarlas en claro en la base de datos.
// La clave viene de EMAIL_ENC_KEY (cualquier texto; se deriva a 32 bytes).
// ============================================
import crypto from 'crypto'

function getKey(): Buffer | null {
  const raw = process.env.EMAIL_ENC_KEY
  if (!raw) return null
  // Deriva una clave de 32 bytes a partir del secreto configurado
  return crypto.createHash('sha256').update(raw).digest()
}

export function isEncryptionConfigured(): boolean {
  return !!getKey()
}

export function encryptSecret(plain: string): string {
  const key = getKey()
  if (!key) throw new Error('EMAIL_ENC_KEY no está configurada en el servidor.')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // formato: iv.tag.ciphertext (base64)
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

export function decryptSecret(payload: string): string {
  const key = getKey()
  if (!key) throw new Error('EMAIL_ENC_KEY no está configurada en el servidor.')
  const [ivB, tagB, dataB] = payload.split('.')
  const iv = Buffer.from(ivB, 'base64')
  const tag = Buffer.from(tagB, 'base64')
  const data = Buffer.from(dataB, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
