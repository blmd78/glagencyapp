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
import type { Kpi } from '../types'

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
              variant="outline"
              className={cn(
                'gap-1 text-xs',
                up
                  ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                  : 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300',
              )}
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
