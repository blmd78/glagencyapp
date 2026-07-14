'use client'

import { createContext, useContext } from 'react'

/**
 * Contexte de la transition de navigation — SÉPARÉ des composants (nav-transition.tsx) :
 * un module qui mélange hook et composants n'est pas une frontière Fast Refresh valide →
 * chaque édition ré-évaluait le module, recréait le contexte, et un render pouvait mélanger
 * ancien provider / nouveau hook (contexte null) → crash + « full reload » en boucle.
 */
export const NavTransitionCtx = createContext<{
  navigate: (href: string) => void
  pending: boolean
} | null>(null)

/**
 * Contexte de navigation, ou null hors provider. Ne throw JAMAIS en render : sans provider
 * (chunk périmé après déploiement, HMR incohérent) on dégrade en navigation <Link> native.
 */
export function useNavTransition() {
  return useContext(NavTransitionCtx)
}
