import { API_BASE, UA, frDateToIso } from '../client'

/** CA d'un compte pour un jour (montant encaissé, devise du compte). */
export interface RevenueDay {
  day: string
  revenue: number
}

type RawVolumes = Record<string, number>

/** Réponse `transactions/volumes` (objet clé par jour Paris) → lignes ISO triées par date. */
export function parseTxVolumes(raw: RawVolumes): RevenueDay[] {
  return Object.entries(raw)
    .map(([key, amount]) => ({ day: frDateToIso(key), revenue: amount }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** `currency` est OBLIGATOIRE côté Uncove (le serveur renvoie 400 ZodError sinon). */
export function transactionsVolumesUrl(start: string, end: string, currency: string): string {
  return `${API_BASE}/transactions/volumes?${new URLSearchParams({ start, end, currency }).toString()}`
}

// Glue réseau (thin, non testée unitairement — même convention que @glagency/mypuls).
export async function fetchTxVolumes(
  token: string,
  start: string,
  end: string,
  currency: string,
): Promise<RevenueDay[]> {
  const res = await fetch(transactionsVolumesUrl(start, end, currency), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`GET transactions/volumes ${res.status}`)
  return parseTxVolumes((await res.json()) as RawVolumes)
}
