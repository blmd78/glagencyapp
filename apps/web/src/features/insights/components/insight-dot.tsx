import { cn } from '@/lib/utils'
import type { InsightStatus } from '../types'

/**
 * « À traiter » — une carte l'est tant qu'elle n'est ni résolue ni ignorée. Partagée par le
 * compteur de l'en-tête de modèle et par le point posé sur chaque carte : sans ça, « 2 à
 * traiter » pourrait afficher trois points.
 *
 * ATTENTION, ce n'est PAS encore la seule expression du prédicat : le filtre `statusFilter ===
 * 'open'` (`insights-view.tsx`) et le service `get-insights.ts` l'inlinent toujours. Les
 * brancher ici est un chantier à part — ils ne portent pas exactement la même question.
 */
export const isATraiter = (status: InsightStatus) => status === 'new' || status === 'in_progress'

const TONE = {
  total: 'bg-green-500',
  critique: 'bg-red-500',
  'a-traiter': 'bg-amber-500',
} as const

/**
 * Point de couleur — repère SCANNABLE : vert = total, rouge = critique, ambre = à traiter. Sur
 * une carte, il remplace la barre `border-l-4` qu'elle portait avant son passage sur
 * `CollapsibleSection` (2026-07-27) : même information, dans le langage visuel commun aux
 * accordéons de l'app. Dans l'en-tête d'un modèle, les trois points alignent les compteurs sur
 * un même code couleur.
 *
 * `size-2.5` et non `size-2`, et posé à GAUCHE : les pastilles de quotas de la carte (vert =
 * atteint / rouge = manqué) sont en `size-2` groupées à droite — deux repères de sens
 * différent ne doivent pas se confondre.
 *
 * `aria-hidden` : l'information est déjà portée en toutes lettres par les badges « Critique »
 * et le statut à côté — le point n'est qu'un raccourci pour l'œil.
 */
export function InsightDot({ tone, title }: { tone: keyof typeof TONE; title?: string }) {
  return (
    <span
      aria-hidden
      title={title}
      className={cn('size-2.5 shrink-0 rounded-full', TONE[tone])}
    />
  )
}
