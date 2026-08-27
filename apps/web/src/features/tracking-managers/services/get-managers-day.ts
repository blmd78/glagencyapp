import { dayBounds, managerDay, type ManagerDay } from '@glagency/core'
import { readTrackerWindow } from '@/lib/tracking/window'

export interface ManagerRow {
  profileId: string
  name: string
  day: ManagerDay
}

export interface ManagersData {
  date: string
  /** Vrai si la date demandée est aujourd'hui — la barre « en ligne » n'existe que dans ce cas. */
  isToday: boolean
  rows: ManagerRow[]
  activeCount: number
  computedAtMs: number
}

/**
 * La journée des encadrants : des FAITS, aucun verdict — pas de quota, pas de conformité.
 * C'est le parti pris du domaine (`managerDay`), et celui de leur écran : l'admin juge lui-même.
 *
 * FENÊTRE ÉLARGIE À DROITE : un shift d'encadrant appartient EN ENTIER au jour où il a commencé.
 * Celui qui démarre à 22 h se termine le lendemain matin, donc au-delà de la fin de journée. Sans
 * ces 12 h de marge, sa fin serait tronquée et son temps travaillé amputé d'autant. La marge à
 * gauche, elle, est déjà appliquée par la RPC.
 */
export async function getManagersDay(date: string, now = Date.now()): Promise<ManagersData> {
  const bounds = dayBounds(date)
  const { people } = await readTrackerWindow({
    from: bounds.start,
    to: bounds.end + 12 * 3_600_000,
    role: 'manager',
  })

  const rows: ManagerRow[] = people
    .map((p) => ({ profileId: p.profileId, name: p.name, day: managerDay(p.events, date, { now }) }))
    .filter((r) => r.day.hasActivity)
    .sort((a, b) => (a.day.started ?? 0) - (b.day.started ?? 0))

  return {
    date,
    isToday: date === new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(now)),
    rows,
    activeCount: rows.filter((r) => r.day.live != null).length,
    computedAtMs: now,
  }
}
