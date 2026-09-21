// Client Uncove — API REST JSON authentifiée par un JWT Bearer.
// L'API (`/api/v2.0/…`) n'exige que le header Authorization ; le Turnstile ne protège que le
// login web, jamais l'API. Le même jeton (cookie `user_token`) est longue durée : on le capture
// après un login humain, on le stocke chiffré, on le rejoue tel quel (cf. spec Uncove 2026-09-21).

export const BASE_URL = 'https://uncove.com'
export const API_BASE = `${BASE_URL}/api/v2.0`
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) glagency-ingestion'

/** Clé de réponse Uncove « DD/MM/YYYY » (jour Europe/Paris) → ISO « YYYY-MM-DD ». */
export function frDateToIso(key: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(key.trim())
  if (!m) throw new Error(`Date Uncove invalide : ${key}`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Identité du compte (« users/7157370201 ») lue dans le payload du JWT, sans vérifier la signature. */
export function decodeUserId(token: string): string {
  const part = token.split('.')[1]
  if (!part) throw new Error('JWT Uncove invalide (payload absent)')
  const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { id?: unknown }
  if (typeof payload.id !== 'string') throw new Error('JWT Uncove sans champ id')
  return payload.id
}

/** Ligne du portefeuille (solde courant du compte). */
export interface WalletEntry {
  balance: number
  currency: string
  pausedTransfers: unknown
}

// Glue réseau (thin, non testée unitairement — même convention que @glagency/mypuls).
export async function fetchWallet(token: string): Promise<WalletEntry[]> {
  const res = await fetch(`${API_BASE}/wallet/`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`GET wallet/ ${res.status}`)
  return (await res.json()) as WalletEntry[]
}

/** Valide un token en tapant /wallet/ : 200 = jeton actif. Sert à l'ajout d'un compte. */
export async function verifyToken(token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/wallet/`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
  })
  return res.ok
}
