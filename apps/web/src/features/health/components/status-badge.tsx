import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import type { LtvStatus } from '../types'

// Couleurs partagées (recette badge shadcn, sans bordure) : lib/status-color.ts.
const STYLES: Record<LtvStatus, string> = {
  sain: STATUS_COLORS.positive,
  moyen: STATUS_COLORS.warning,
  critique: STATUS_COLORS.danger,
}
const LABELS: Record<LtvStatus, string> = { sain: 'Sain', moyen: 'Moyen', critique: 'Critique' }

/** Badge de statut LTV (Sain ≥ cible, Moyen ≥ 7 €, Critique en dessous). */
export function StatusBadge({ status }: { status: LtvStatus | null }) {
  if (!status) return null
  return <Badge className={cn('text-xs', STYLES[status])}>{LABELS[status]}</Badge>
}
