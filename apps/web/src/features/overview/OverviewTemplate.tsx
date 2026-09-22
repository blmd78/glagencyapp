import { KpiGrid } from '@/components/kpi-card'
import { RevenueChart } from './components/revenue-chart'
import type { OverviewData } from './types'

const DEFAULT_ACCENT = 'border-t-blue-500'
const KPI_ACCENTS: Record<string, string> = {
  ca: 'border-t-emerald-500',
  caMypuls: 'border-t-emerald-500',
  caUncove: 'border-t-emerald-500',
  active: DEFAULT_ACCENT,
  avgCa: DEFAULT_ACCENT,
  lowCom: 'border-t-amber-500',
}

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
          « Sous 200 € » en ambre (alerte). Accent par CLÉ et non par position : le nombre de
          cartes varie (mode restreint, bouts `overview:*`, cartes CA par source de 0164) et un
          tableau positionnel décalait les couleurs dès qu'une carte apparaissait. */}
      <KpiGrid kpis={data.kpis} accents={data.kpis.map((k) => KPI_ACCENTS[k.key] ?? DEFAULT_ACCENT)} />

      <RevenueChart data={data.daily} periodLabel={data.periodLabel} scopeLabel={data.dailyScope} />
    </div>
  )
}
