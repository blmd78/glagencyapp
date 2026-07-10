// Types de la feature « planning » (planning journalier des sous-managers).

export type PlanningSection = 'matin' | 'apres_midi' | 'soir'

export interface PlanningBlock {
  id: string
  section: PlanningSection
  position: number
  /** 'HH:MM' — '00:00' en fin = minuit fin de journée. */
  timeStart: string
  timeEnd: string
  title: string
  /** Étiquette de catégorie (COMPTA / SETTERS / CLOSERS…) — vide = pas de badge. */
  badge: string
  /** Barre d'accent + teinte du badge. */
  color: string
  bullets: string[]
}

export interface PlanningData {
  /** Membre concerné. */
  profileId: string
  profileName: string
  /** false = aucun planning enregistré pour ce membre (page vide côté manager). */
  exists: boolean
  priorityTitle: string
  priorityBody: string
  priorityForbidden: string
  priorityAllowed: string
  pauseNote: string
  annexes: { title: string; detail: string }[]
  annexNote: string
  blocks: PlanningBlock[]
}

export interface PlanningMember {
  id: string
  name: string
  role: string
}
