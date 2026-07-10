import type { PlanningSection } from './types'

/** Libellés des sections du planning journalier, dans l'ordre d'affichage. */
export const SECTION_LABELS: Record<PlanningSection, string> = {
  matin: 'Matin',
  apres_midi: 'Après-midi',
  soir: 'Soir',
}
export const SECTIONS: PlanningSection[] = ['matin', 'apres_midi', 'soir']

/** 'HH:MM' → minutes depuis minuit. */
export const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Durée d'un créneau en minutes — une fin ≤ début passe minuit (ex. 22:30 → 00:00). */
export const durationMin = (start: string, end: string): number => {
  const d = toMin(end) - toMin(start)
  return d > 0 ? d : d + 24 * 60
}

/** 150 → '2h30' · 60 → '1h00' · 45 → '45 min'. */
export const fmtDuration = (min: number): string => {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return `${h}h${String(m).padStart(2, '0')}`
}

/** '09:30' → '9h30' (affichage à la française). */
export const fmtTime = (t: string): string => {
  const [h, m] = t.split(':')
  return `${Number(h)}h${m}`
}
