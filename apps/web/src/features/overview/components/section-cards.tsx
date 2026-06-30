import { TrendingDown, TrendingUp } from 'lucide-react'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { KpiCard } from '../types'

export function SectionCards({ kpis }: { kpis: KpiCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const up = kpi.deltaPct >= 0
        const Trend = up ? TrendingUp : TrendingDown
        const sign = up ? '+' : ''
        return (
          <Card key={kpi.key} className="gap-2">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardDescription>{kpi.label}</CardDescription>
                <Badge variant="outline" className="gap-1 text-xs">
                  <Trend className="size-3" />
                  {sign}
                  {kpi.deltaPct.toLocaleString('fr-FR')}%
                </Badge>
              </div>
              <CardTitle className="text-2xl font-semibold tabular-nums lg:text-3xl">
                {kpi.value}
              </CardTitle>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm">
              <div className="flex items-center gap-1 font-medium">
                {kpi.trendLabel}
                <Trend className="size-4" />
              </div>
              <div className="text-muted-foreground">{kpi.hint}</div>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
