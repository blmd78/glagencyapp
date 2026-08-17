/**
 * Vocabulaire PARTAGÉ du catalogue de formation (features `training-catalog` — admin — et
 * `training-modules` — lecture) : les sortes de cas et les locuteurs des messages d'ouverture.
 * Miroir des `check` SQL de 0113 (`kind in ('solo','arena','boss')`, `speaker in ('creator','fan')`).
 */
export const CASE_KINDS = ['solo', 'arena', 'boss'] as const
export type CaseKind = (typeof CASE_KINDS)[number]
export const CASE_KIND_LABELS: Record<CaseKind, string> = {
  solo: 'Solo',
  arena: 'Défi simultané',
  boss: 'Boss final',
}

export const SPEAKERS = ['creator', 'fan'] as const
export type Speaker = (typeof SPEAKERS)[number]
export const SPEAKER_LABELS: Record<Speaker, string> = { creator: 'Créatrice', fan: 'Fan' }
