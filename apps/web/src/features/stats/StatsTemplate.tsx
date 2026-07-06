import { SubsChart } from './components/subs-chart'
import type { StatsData } from './types'

/** Template Stats : statistiques par modèle (abonnés par jour). Aucun fetch. */
export function StatsTemplate({ data }: { data: StatsData }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · courbes d&apos;abonnés par modèle
        </p>
      </div>
      <SubsChart data={data} />
    </div>
  )
}
