import { daysBetween } from '@glagency/core'
import type { AgencyEvent } from './month-layout'

/** Onglets de la liste sous le calendrier (`?vue=`). L'accueil (`a-venir`) ne s'écrit pas dans l'URL. */
export const LIST_TABS = ['a-venir', 'passe'] as const
export type ListTab = (typeof LIST_TABS)[number]

/** `?vue=` inconnu → l'onglet d'accueil, jamais un écran vide. */
export const parseListTab = (value: string | undefined): ListTab =>
  LIST_TABS.includes(value as ListTab) ? (value as ListTab) : 'a-venir'

const byStart = (a: AgencyEvent, b: AgencyEvent) =>
  a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title, 'fr')

/**
 * La liste sous le calendrier (demande Benoit 2026-09-28). « Aujourd'hui » = ce qui couvre le
 * jour, période en cours comprise ; « Prochainement » = pas encore commencé ; « Passé » = fini.
 * L'à-venir dans l'ordre où il arrive, le passé du plus récent au plus ancien.
 */
export function splitEvents(events: AgencyEvent[], today: string) {
  return {
    today: events.filter((e) => e.startDate <= today && e.endDate >= today).sort(byStart),
    upcoming: events.filter((e) => e.startDate > today).sort(byStart),
    past: events.filter((e) => e.endDate < today).sort((a, b) => byStart(b, a)),
  }
}

/** « demain », « dans 12 jours » — pour un événement qui n'a pas encore commencé. */
export function untilLabel(start: string, today: string): string {
  const n = daysBetween(today, start)
  return n === 1 ? 'demain' : `dans ${n} jours`
}
