import { attemptState } from '@glagency/core'
import type { CaseAttempts } from '@/lib/services/training-attempts'
import { GRANT_MAX } from './schema'

type CaseLimit = { id: string; max_attempts: number }

/**
 * Les exercices où le chatteur n'a plus d'essai — la cible de « Redonner partout ». Même règle que
 * le compteur rouge de la fiche (`attemptState`, `get-chatter.ts`) : ce que l'encadrant voit bloqué
 * est exactement ce qui sera débloqué. Un exercice jamais tenté n'est jamais bloqué
 * (`max_attempts ≥ 1`, 0161).
 */
export function lockedCases<C extends CaseLimit>(cases: readonly C[], attempts: ReadonlyMap<string, CaseAttempts>): C[] {
  return cases.filter((c) => {
    const a = attempts.get(c.id)
    return attemptState(c.max_attempts, a?.used ?? 0, a?.granted ?? 0).locked
  })
}

/**
 * Les `extra` des lignes `training_attempt_grants` à écrire pour que le chatteur puisse jouer `n`
 * parties de PLUS qu'aujourd'hui (décision Benoit, 2026-10-15). Sans dépassement, c'est `n`. Mais
 * un historique d'avant la limite peut la dépasser (10 joués pour 3) : ajouter 5 laisserait 10/8,
 * toujours bloqué — on ajoute donc aussi le dépassement (10/15 : 5 parties). La colonne borne
 * `extra` à 20 : au-delà, plusieurs lignes, dont la somme fait le compte.
 */
export function grantExtras(n: number, maxAttempts: number, attempts: CaseAttempts | undefined): number[] {
  const st = attemptState(maxAttempts, attempts?.used ?? 0, attempts?.granted ?? 0)
  const rows: number[] = []
  for (let total = n + Math.max(0, st.used - st.allowed); total > 0; total -= GRANT_MAX) {
    rows.push(Math.min(GRANT_MAX, total))
  }
  return rows
}
