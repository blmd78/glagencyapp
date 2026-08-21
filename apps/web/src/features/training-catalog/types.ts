import type { CaseKind, Speaker } from '@/lib/types/training'

/**
 * Contrat du Catalogue (ADMIN) : le modèle COMPLET — y compris ce qui pilote l'IA (fan_brief,
 * champs cachés des fans du boss) et ce qui se révèle après coup (expected). Ne JAMAIS servir ces
 * types à une page vue par un chatter : la face lecture (`features/training-modules`) a sa
 * projection publique. Ordonné par `position` partout.
 */
export interface CatalogAxis {
  id: string
  key: string
  name: string
  description: string
  position: number
}

export interface CatalogSection {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  position: number
}

export interface CatalogMessage {
  id: string
  position: number
  speaker: Speaker
  body: string
}

export interface CatalogArenaSlot {
  id: string
  position: number
  refCaseId: string
  displayName: string
}

export interface CatalogBossFan {
  id: string
  position: number
  code: string
  name: string
  age: number | null
  job: string | null
  city: string | null
  color: string | null
  persona: string
  openingMessage: string
  budgetCap: number | null
  negoThreshold: number | null
  negoWhere: string | null
  meetWhen: string | null
  meetWhere: string | null
  derails: string | null
}

export interface CatalogCase {
  id: string
  moduleId: string
  sectionId: string | null
  code: string
  kind: CaseKind
  title: string
  phase: string
  difficulty: number
  maxTurns: number
  reactionMaxS: number | null
  isSale: boolean
  context: string
  objective: string
  targetLine: string | null
  fanName: string | null
  fanBrief: string | null
  expected: string | null
  position: number
  active: boolean
  messages: CatalogMessage[]
  arenaSlots: CatalogArenaSlot[]
  bossFans: CatalogBossFan[]
}

export interface CatalogModule {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  objectiveLabel: string
  courseMd: string | null
  scoringNotes: string | null
  position: number
  active: boolean
  axes: CatalogAxis[]
  sections: CatalogSection[]
  cases: CatalogCase[]
}

export interface CatalogData {
  modules: CatalogModule[]
}
