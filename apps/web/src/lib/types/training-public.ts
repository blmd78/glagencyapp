import type { CaseKind } from '@/lib/types/training'

/**
 * Projection PUBLIQUE du catalogue — ce qu'un chatter (droit Entraînement) ou un encadrant
 * (droit Suivi) peut voir AVANT de jouer : jamais la consigne du fan, l'attendu, la consigne de
 * notation ni les champs cachés des fans du boss (ils pilotent l'IA). Actifs uniquement.
 *
 * Ces types vivent dans `lib/` (et non dans une feature) parce que DEUX features les lisent :
 * `training-modules` (le catalogue en lecture) et `training-me` (Ma formation) — une feature
 * n'importe jamais une autre feature (frontière ESLint).
 */
export interface ModuleSummary {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  caseCount: number
  hasCourse: boolean
}

export interface PublicBossFan {
  id: string
  name: string
  age: number | null
  job: string | null
  city: string | null
  color: string | null
  persona: string
}

export interface PublicCase {
  id: string
  code: string
  kind: CaseKind
  title: string
  phase: string
  difficulty: number
  maxTurns: number
  reactionMaxS: number | null
  isSale: boolean
  sectionId: string | null
  position: number
  /** Boss final uniquement (côté visible des fans). */
  bossFans: PublicBossFan[]
}

export interface ModuleDetail {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  objectiveLabel: string
  courseMd: string | null
  axes: { key: string; name: string; description: string }[]
  sections: { id: string; title: string; emoji: string | null; description: string | null }[]
  cases: PublicCase[]
}

/** Un cas actif du catalogue, réduit à ce qu'il faut pour la progression par module. */
export interface PublicCaseRef {
  id: string
  moduleId: string
  kind: CaseKind
  title: string
  sectionId: string | null
}
