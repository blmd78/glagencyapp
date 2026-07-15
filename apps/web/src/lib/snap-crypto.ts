import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement réversible des secrets applicatifs (mots de passe Snapchat) — AES-256-GCM,
 * clé 32 octets base64 dans SNAP_CODES_SECRET (env serveur, JAMAIS en base) : un dump de
 * la base ne révèle rien, seul le serveur (qui a la clé) peut restituer. Ce n'est PAS du
 * hash : ces identifiants doivent être affichés à l'équipe (service tiers).
 * Module SERVEUR uniquement (node:crypto) — importé par services/actions, jamais 'use client'.
 * Format stocké : `v1:<iv>:<tag>:<cipher>` (base64).
 */

function getKey(): Buffer | null {
  const b64 = process.env.SNAP_CODES_SECRET
  if (!b64) return null
  const key = Buffer.from(b64, 'base64')
  return key.length === 32 ? key : null
}

export function encryptSecret(plain: string): string {
  if (!plain) return ''
  const key = getKey()
  if (!key) throw new Error('SNAP_CODES_SECRET absente ou invalide (32 octets base64 attendus)')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

/** null = clé absente/corruption (l'appelant affiche un état dégradé, pas un crash). */
export function decryptSecret(stored: string): string | null {
  if (!stored) return ''
  if (!stored.startsWith('v1:')) return stored // tolérance : valeur héritée en clair
  const key = getKey()
  if (!key) return null
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(':')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
