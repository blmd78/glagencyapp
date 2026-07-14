'use client'

import { createContext, useContext } from 'react'
import type { SpendersData } from '../types'

/**
 * Données spenders partagées par les 4 vues, fournies UNE FOIS par le layout
 * app/(dash)/chatter/spenders/layout.tsx (fetch unique — naviguer entre les vues ne
 * re-télécharge plus les ~1 700 lignes). Module sans composant (contexte + hook) =
 * frontière Fast Refresh saine.
 */

export interface SpendersShared {
  data: SpendersData
  isAdmin: boolean
}

export const SpendersDataCtx = createContext<SpendersShared | null>(null)

/** Données du layout partagé, ou null (chunk périmé) — jamais de throw en render. */
export function useSpendersData(): SpendersShared | null {
  return useContext(SpendersDataCtx)
}
