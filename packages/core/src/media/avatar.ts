/**
 * Photos des modèles (spec docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md, A).
 * MyPuls sert `/creator/<id>/avatar` en WebP 100 × 100 tout en annonçant `image/jpeg` : le type se
 * lit sur les premiers octets, jamais sur l'en-tête.
 */

export type ImageMime = 'image/webp' | 'image/jpeg' | 'image/png'

/** Plafond du bucket `creator-avatars` (1 Mo) : une image plus lourde est refusée avant l'envoi. */
export const AVATAR_MAX_BYTES = 1_048_576

export const AVATAR_EXT: Record<ImageMime, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

/** WebP = « RIFF » + taille + « WEBP » ; JPEG = FF D8 FF ; PNG = 89 « PNG » 0D 0A 1A 0A. */
export function sniffImageType(b: Uint8Array): ImageMime | null {
  if (b.length >= 12 && starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  if (b.length >= 3 && starts(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (b.length >= 8 && starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  return null
}

export type AvatarOutcome =
  | { kind: 'image'; mime: ImageMime; ext: string }
  | { kind: 'session' }
  | { kind: 'invalid'; reason: string }

/**
 * Ce que vaut une réponse de `/creator/<id>/avatar`, lue avec `redirect: 'manual'`. Une redirection
 * vers `/login` = session expirée : le script s'arrête plutôt que de ranger la page de connexion.
 */
export function avatarOutcome(res: { status: number; location: string | null; bytes: Uint8Array }): AvatarOutcome {
  if (res.status >= 300 && res.status < 400) {
    return /\/login\b/.test(res.location ?? '') ? { kind: 'session' } : { kind: 'invalid', reason: `redirection ${res.status}` }
  }
  if (res.status !== 200) return { kind: 'invalid', reason: `HTTP ${res.status}` }
  if (res.bytes.length > AVATAR_MAX_BYTES) return { kind: 'invalid', reason: 'image de plus de 1 Mo' }
  const mime = sniffImageType(res.bytes)
  return mime ? { kind: 'image', mime, ext: AVATAR_EXT[mime] } : { kind: 'invalid', reason: 'pas une image' }
}

export interface AvatarCreator {
  id: string
  name: string
  mypulsCreatorId: string | null
  avatarPath: string | null
}

/** Les modèles à traiter : avec un id MyPuls, et sans photo — toutes avec `force`. */
export function avatarTargets(creators: AvatarCreator[], force = false): AvatarCreator[] {
  return creators.filter((c) => !!c.mypulsCreatorId && (force || !c.avatarPath))
}
