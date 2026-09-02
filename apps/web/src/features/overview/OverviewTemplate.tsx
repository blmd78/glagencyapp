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

      {/* Liserés = code couleur de l'app : CA en émeraude (argent), cartes CHATTERS en bleu,
          « Sous 200 € » en ambre (alerte). En mode restreint la 4e carte n'existe pas. */}
      <KpiGrid
        kpis={data.kpis}
        accents={['border-t-emerald-500', 'border-t-blue-500', 'border-t-blue-500', 'border-t-amber-500']}
      />

      <RevenueChart data={data.daily} periodLabel={data.periodLabel} scopeLabel={data.dailyScope} />
    </div>
  )
}
