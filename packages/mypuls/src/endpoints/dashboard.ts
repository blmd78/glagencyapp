import { BASE_URL, UA } from '../client'

/**
 * Endpoints JSON du dashboard MyPuls (session web, mêmes routes que les charts de la page
 * /dashboard). Bornes `start`/`end` = jours INCLUS ; les `labels` renvoyés listent chaque
 * jour et tous les tableaux (`data`, `breakdown.*`, `renewals`) sont indexés dessus.
 */

/** Série CA d'un modèle : `data[i]` (total du jour) = somme des `breakdown.*[i]`. */
export interface StatsDataset {
  label: string
  creatorId: number
  platform?: string
  currency?: string
  data: number[]
  /** Par type de revenu : tips, abo, ppv, mod, renew, push, affiliation, live. */
  breakdown: Record<string, number[]>
}

export interface DashboardStats {
  labels: string[]
  datasets: StatsDataset[]
}

/** Série abonnés d'un modèle (comptes, pas des €). */
export interface SubsDataset {
  label: string
  creatorId: number
  data: number[]
  /** Présent sur `newSubsDatasets` uniquement. */
  renewals?: number[]
}

export interface DashboardSubscriptions {
  labels: string[]
  /** `data` = premiers abonnements all-time du fan ; `renewals` = ré-abos/auto-renew. */
  newSubsDatasets: SubsDataset[]
  /** Abonnés actifs (snapshots quotidiens à 23h59 — vide avant le premier snapshot). */
  totalSubsDatasets: SubsDataset[]
}

async function getJson<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} ${res.status}`)
  if (res.url.includes('/login')) throw new Error(`${path.split('?')[0]}: session expirée (redirigé vers /login)`)
  return (await res.json()) as T
}

/** CA quotidien par modèle, ventilé par type (source du « Comparatif modèles »). */
export const fetchDashboardStats = (start: string, end: string, cookie: string) =>
  getJson<DashboardStats>(`/dashboard/stats?start=${start}&end=${end}`, cookie)

/** Nouveaux abonnés / renouvellements / abonnés actifs quotidiens par modèle. */
export const fetchDashboardSubscriptions = (start: string, end: string, cookie: string) =>
  getJson<DashboardSubscriptions>(`/dashboard/subscriptions?start=${start}&end=${end}`, cookie)
