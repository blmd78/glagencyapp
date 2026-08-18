import { medalFor } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { MEDAL_LABELS } from '@/lib/types/training'

/**
 * Meilleur résultat d'un cas : « Or 92 » / « Argent 78 » / « Bronze 64 », « 45 — à valider »
 * sous 60. Badge outline, jamais de doré : la médaille se lit, elle ne brille pas.
 * Partagé Modules / Ma formation (d'où `components/`, pas une feature).
 */
export function MedalBadge({ best, className }: { best: number | null; className?: string }) {
  if (best == null) return null
  const medal = medalFor(best)
  return (
    <Badge variant="outline" className={className}>
      {medal ? `${MEDAL_LABELS[medal]} ${best}` : `${best} — à valider`}
    </Badge>
  )
}
