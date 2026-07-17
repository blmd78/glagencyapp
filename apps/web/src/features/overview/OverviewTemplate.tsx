import { KpiGrid } from '@/components/kpi-card'
import { RevenueChart } from './components/revenue-chart'
import type { OverviewData } from './types'

/**
 * Template de la feature Overview : compose les composants à partir des données
 * reçues en props. Aucun fetch ici (convention app → feature(template) → composants).
 */
export function OverviewTemplate({ data }: { data: OverviewData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.periodLabel} · vue d’ensemble de l’agence
      </p>

      <KpiGrid kpis={data.kpis} />

      <RevenueChart data={data.daily} periodLabel={data.periodLabel} />
    </div>
  )
}
