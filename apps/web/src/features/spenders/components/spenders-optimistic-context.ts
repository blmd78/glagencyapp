'use client'

import { createContext, useContext } from 'react'
import type { SpenderRow } from '../types'

/**
 * Optimistic UI du tracker : au clic, la ligne est patchée IMMÉDIATEMENT à l'écran
 * (compteur, grisé, archive…), l'enregistrement part en arrière-plan, et React revient
 * automatiquement à l'état serveur si l'action échoue (useOptimistic dans SpendersView).
 * `fail` remonte l'erreur au niveau de la VUE : le patch optimiste sort souvent la ligne
 * de la vue courante → le composant cliqué est démonté avant la réponse serveur, un
 * setState local d'erreur y serait un no-op silencieux (bug confirmé en revue).
 * Module sans composant (contexte + hook + reducer) = frontière Fast Refresh saine.
 */

export type SpenderPatch =
  | { type: 'relance'; creatorId: string; fanId: number; at: string }
  | { type: 'reset'; creatorId: string; fanId: number }
  | { type: 'set-compteur'; creatorId: string; fanId: number; value: number }
  | { type: 'archive'; creatorId: string; fanId: number; archived: boolean }

/**
 * Reducer pur : applique un patch à la ligne visée, en reproduisant EXACTEMENT ce que le
 * serveur renverra (RPC crm_spenders_tracker). reset et set-compteur rebornent le cycle
 * (compteur_reset_at = now) → les relances passées en sortent : plus de « relancé
 * aujourd'hui » (grise=false) ni de date de dernière relance.
 */
export function applyPatch(rows: SpenderRow[], patch: SpenderPatch): SpenderRow[] {
  return rows.map((s) => {
    if (s.creatorId !== patch.creatorId || s.fanId !== patch.fanId) return s
    switch (patch.type) {
      case 'relance':
        // conversionPending:false : le RPC le calcule sur last_message_at > derniere_relance_at.
        return { ...s, compteurR: s.compteurR + 1, grise: true, derniereRelanceAt: patch.at, conversionPending: false }
      case 'reset':
        return { ...s, compteurR: 0, conversionPending: false, grise: false, derniereRelanceAt: null }
      case 'set-compteur':
        return { ...s, compteurR: patch.value, grise: false, derniereRelanceAt: null, conversionPending: false }
      case 'archive':
        return { ...s, archived: patch.archived }
    }
  })
}

export interface SpendersOptimistic {
  /** Patch optimiste immédiat (à appeler DANS une transition, avant le await de l'action). */
  apply: (patch: SpenderPatch) => void
  /** Erreur d'action à afficher au niveau de la vue (survit au démontage de la ligne). */
  fail: (message: string) => void
}

export const SpendersOptimisticCtx = createContext<SpendersOptimistic | null>(null)

const NOOP: SpendersOptimistic = { apply: () => {}, fail: () => {} }

/**
 * Accès au dispatch optimiste — no-op hors provider (jamais de throw en render : sans
 * provider, les boutons retombent sur le comportement « attendre la réponse serveur »).
 */
export function useSpendersOptimistic(): SpendersOptimistic {
  return useContext(SpendersOptimisticCtx) ?? NOOP
}
