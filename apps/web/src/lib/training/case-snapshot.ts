import type { CaseSnapshot } from '@/lib/types/training'

/**
 * Assemblage du `case_snapshot` d'une session — la PARTIE VISIBLE du cas, figée au moment joué.
 *
 * Module NEUTRE, pur, zéro I/O : il est importé par `lib/training/start-session.ts` (qui commence
 * par `'use server'`, donc dont tout export devient un point d'entrée appelable depuis le
 * navigateur) ET par `lib/gla/transform.ts` (reprise Good Luck Agency). Sans cette extraction,
 * « réutiliser » signifierait recopier — deux vérités qui divergeraient.
 *
 * CE QUI N'Y ENTRE JAMAIS :
 *  - `targetLine` (la réponse attendue du correcteur) — `get-session.ts:37-38` la purge de toute
 *    façon des snapshots écrits avant ce correctif ;
 *  - `fan_brief` / `expected` — des SECRETS, durcis en tables admin-only par 0116.
 *
 * `title` et `moduleTitle` sont lus DIRECTEMENT par l'historique de Ma formation
 * (`get-me.ts:72-79`) : un snapshot bâclé donne un historique illisible.
 */

/** La forme rendue par un `select` sur `training_cases` avec le module en embed. */
export interface CaseSnapshotRow {
  code: string
  title: string
  phase: string
  difficulty: number
  context: string
  objective: string
  max_turns: number
  reaction_max_s: number | null
  is_sale: boolean
  training_modules: { code: string; title: string; objective_label: string }
}

export function buildCaseSnapshot(c: CaseSnapshotRow): CaseSnapshot {
  return {
    code: c.code,
    title: c.title,
    phase: c.phase,
    difficulty: c.difficulty,
    context: c.context,
    objective: c.objective,
    objectiveLabel: c.training_modules.objective_label,
    maxTurns: c.max_turns,
    reactionMaxS: c.reaction_max_s,
    isSale: c.is_sale,
    moduleTitle: c.training_modules.title,
    moduleCode: c.training_modules.code,
  }
}
