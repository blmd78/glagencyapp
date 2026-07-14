'use client'

import { SpendersTemplate } from '../SpendersTemplate'
import { useSpendersData } from './spenders-data-context'
import type { SpendersViewKind } from './spenders-view'

/**
 * Écran d'une vue spenders : consomme les données du layout partagé (fetch unique pour
 * les 4 vues) — la page ne pèse plus que quelques Ko, changer de vue est instantané.
 */
export function SpendersScreen({ view }: { view: SpendersViewKind }) {
  const shared = useSpendersData()
  // Hors provider (chunk périmé après déploiement) : rien plutôt qu'un crash — une
  // navigation native recharge la page proprement.
  if (!shared) return null
  return <SpendersTemplate data={shared.data} view={view} isAdmin={shared.isAdmin} />
}
