import { MEDAL_ARGENT, MEDAL_BRONZE } from '@glagency/core'

/**
 * Feu tricolore d'une note, en POURCENTAGE — source unique pour la jauge de résultat et les barres
 * par axe. Deux échelles de couleur différentes sur le même écran (une pour la note globale, une
 * pour les critères) rendraient les deux illisibles.
 *
 * Mêmes seuils que `ScoreBadge` : vert dès Argent, ambre au Bronze, rouge sous le seuil de
 * validation. Un axe à 18/25 (72 %) est donc « ambre », comme une note globale de 72.
 */
export function scoreColor(pct: number | null | undefined): { text: string; bg: string } {
  if (pct == null) return { text: 'text-muted-foreground', bg: 'bg-muted-foreground/40' }
  if (pct >= MEDAL_ARGENT) return { text: 'text-green-600', bg: 'bg-green-600' }
  if (pct >= MEDAL_BRONZE) return { text: 'text-amber-500', bg: 'bg-amber-500' }
  return { text: 'text-red-600', bg: 'bg-red-600' }
}
