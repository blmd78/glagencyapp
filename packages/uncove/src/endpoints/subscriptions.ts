import { API_BASE, UA, frDateToIso } from '../client'

/** Abonnés d'un compte pour un jour : nouveaux, désabonnements, actifs (total). */
export interface SubsDay {
  day: string
  new: number
  canceled: number
  current: number
}

type RawSubs = Record<string, { new: number; canceled: number; current: number }>

/** Réponse `subscribe/volumes` (objet clé par jour Paris) → lignes ISO triées par date. */
export function parseSubsVolumes(raw: RawSubs): SubsDay[] {
  return Object.entries(raw)
    .map(([key, v]) => ({ day: frDateToIso(key), new: v.new, canceled: v.canceled, current: v.current }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** `start`/`end` = bornes ISO UTC (jours inclus, cf. l'app Uncove). */
export function subscribeVolumesUrl(start: string, end: string): string {
  return `${API_BASE}/subscribe/volumes?${new URLSearchParams({ start, end }).toString()}`
}

// Glue réseau (thin, non testée unitairement — même convention que @glagency/mypuls).
export async function fetchSubsVolumes(token: string, start: string, end: string): Promise<SubsDay[]> {
  const res = await fetch(subscribeVolumesUrl(start, end), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`GET subscribe/volumes ${res.status}`)
  return parseSubsVolumes((await res.json()) as RawSubs)
}
