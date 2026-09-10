import type { LtvStatus } from './types'

/**
 * Couleur de la jauge LTV selon le statut. Alignée sur `lib/status-color.ts` (green/amber/red) —
 * recharts exige un fill littéral, d'où les hex (tailwind 500).
 */
const FILL: Record<LtvStatus, string> = {
  sain: '#22c55e',
  moyen: '#f59e0b',
  critique: '#ef4444',
}

export const ltvColor = (status: LtvStatus | null): string =>
  status ? FILL[status] : 'var(--muted)'

/**
 * Repère de la jauge : ~120 % de la cible, pour qu'une LTV à la cible ne sature pas tout à fait
 * et qu'un dépassement reste lisible. Était calculé dans le composant avant qu'il ne devienne
 * partagé (le Marketing a un tout autre repère : la moyenne de ses liens, pas une cible).
 */
export const ltvGaugeMax = (target: number): number => target * 1.2
