import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement réversible des `user_token` Uncove — AES-256-GCM, clé 32 octets base64 dans
 * UNCOVE_TOKEN_SECRET (env serveur, JAMAIS en base). Partagé entre le web (chiffre à l'ajout
 * d'un compte) et l'ingestion (déchiffre au scrap) — d'où sa place dans @glagency/db, dont les
 * deux dépendent. Miroir de apps/web/src/lib/snap-crypto.ts, avec une clé dédiée.
 * Format stocké : `v1:<iv>:<tag>:<cipher>` (base64). Module SERVEUR uniquement (node:crypto).
 */
function getKey(): Buffer | null {
  const b64 = process.env.UNCOVE_TOKEN_SECRET
  if (!b64) return null
  const key = Buffer.from(b64, 'base64')
  return key.length === 32 ? key : null
}

export function encryptToken(plain: string): string {
  if (!plain) return ''
  const key = getKey()
  if (!key) throw new Error('UNCOVE_TOKEN_SECRET absente ou invalide (32 octets base64 attendus)')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

/** null = clé absente/corruption (l'appelant gère un état dégradé, pas un crash). */
export function decryptToken(stored: string): string | null {
  if (!stored) return ''
  if (!stored.startsWith('v1:')) return stored
  const key = getKey()
  if (!key) return null
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(':')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64!, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
