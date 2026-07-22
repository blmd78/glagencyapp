import type { StatChatteurData } from './types'
import { StatKpis } from './components/stat-kpis'
import { StatRanking } from './components/stat-ranking'

/** Template Stat chatteur : 4 KPI de comptage + classement filtrable par ventes. Aucun fetch. */
export function StatChatteurTemplate({ data }: { data: StatChatteurData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · {data.rows.length} chatteurs closing
      </p>
      <StatKpis kpis={data.kpis} />
      <StatRanking rows={data.rows} />
    </div>
  )
}
