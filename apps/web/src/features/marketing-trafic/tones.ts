import { LS_THRESHOLDS, type LsFlag, type LsPlatform } from '@glagency/core'
import type { StatusColor } from '@/lib/status-color'
import { typeBadge } from '@/lib/type-badge'

/**
 * Badge d'un réseau, aux couleurs de Liens tracking (`typeBadge`) pour garder un seul code couleur
 * dans le marketing. X s'y appelle `twitter` ; Threads et « Autre » n'y ont pas de teinte : gris.
 */
export function platformBadge(platform: LsPlatform): string {
  return typeBadge(platform === 'x' ? 'twitter' : platform)
}

export type TraficTone = Extract<StatusColor, 'positive' | 'warning' | 'danger'>

/** Couleur de texte d'un chiffre, mêmes teintes que « Δ période » de la page Twitter / X. */
export const TONE_TEXT: Record<TraficTone, string> = {
  positive: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
}

/** Rouge pour ce qui PERD du trafic (chute, lien éteint), ambre pour ce qui le gâche. */
export function flagTone(flag: LsFlag): TraficTone {
  return flag === 'chute' || flag === 'eteint' ? 'danger' : 'warning'
}

export function deltaTone(pct: number | null): TraficTone | null {
  if (pct == null || pct === 0) return null
  return pct > 0 ? 'positive' : 'danger'
}

/** Ambre dès 10 % de bots, rouge au-delà du seuil du badge « Beaucoup de bots ». */
export function botTone(share: number | null): TraficTone | null {
  if (share == null) return null
  if (share > LS_THRESHOLDS.botShare) return 'danger'
  return share > 0.1 ? 'warning' : null
}
