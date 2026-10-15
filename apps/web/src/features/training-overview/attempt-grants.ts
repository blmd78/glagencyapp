import { attemptState } from '@glagency/core'
import type { CaseAttempts } from '@/lib/services/training-attempts'
import { GRANT_MAX } from './schema'

type CaseLimit = { id: string; max_attempts: number }

/**
 * Les lignes à écrire pour une SÉLECTION de niveaux (interrupteurs de la fiche) : `n` parties de
 * plus sur chacun (`grantExtras`). Ne garde que les niveaux du catalogue affiché (`cases`) déjà
 * joués — la règle des interrupteurs, qui n'apparaissent que là — : un id forgé, hors catalogue ou
 * jamais joué, n'écrit rien.
 */
export function selectionGrants(
  cases: readonly CaseLimit[],
  attempts: ReadonlyMap<string, CaseAttempts>,
  caseIds: readonly string[],
  n: number,
): { caseId: string; extra: number }[] {
  const wanted = new Set(caseIds)
  return cases
    .filter((c) => wanted.has(c.id) && (attempts.get(c.id)?.used ?? 0) > 0)
    .flatMap((c) => grantExtras(n, c.max_attempts, attempts.get(c.id)).map((extra) => ({ caseId: c.id, extra })))
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
