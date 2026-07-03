import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'

/** Contrat d'une carte KPI (partagé entre features : overview, health…). */
export interface Kpi {
  key: string
  /** Libellé de la carte, ex. « CA du mois ». */
  label: string
  /** Valeur déjà formatée, ex. « 258 853 € ». */
  value: string
  /** Variation en % vs période précédente (null si non calculée). */
  deltaPct: number | null
  /** Phrase de tendance, ex. « En hausse vs mai ». */
  trendLabel: string
  /** Sous-titre discret, ex. « mai ≈ 244 756 € ». */
  hint: string
}

/** Une carte KPI : libellé, valeur, badge de tendance et sous-titre. `accent` colore le liseré. */
export function KpiCard({ kpi, accent }: { kpi: Kpi; accent?: string }) {
  const hasDelta = kpi.deltaPct !== null
  const up = (kpi.deltaPct ?? 0) >= 0
  const Trend = up ? TrendingUp : TrendingDown

  return (
    <Card className={cn('gap-2 border-t-4', accent)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{kpi.label}</CardDescription>
          {hasDelta && (
            <Badge
              className={cn('gap-1 text-xs', up ? STATUS_COLORS.positive : STATUS_COLORS.danger)}
            >
              <Trend className="size-3" />
              {up ? '+' : ''}
              {kpi.deltaPct!.toLocaleString('fr-FR')}%
            </Badge>
          )}
        </div>
        <CardTitle className="text-2xl font-semibold tabular-nums lg:text-3xl">
          {kpi.value}
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <div className="flex items-center gap-1 font-medium">
          {kpi.trendLabel}
          {hasDelta && <Trend className="size-4" />}
        </div>
        <div className="text-muted-foreground">{kpi.hint}</div>
      </CardFooter>
    </Card>
  )
}
