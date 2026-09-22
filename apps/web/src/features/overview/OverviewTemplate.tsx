import { KpiGrid } from '@/components/kpi-card'
import { RevenueChart } from './components/revenue-chart'
import type { OverviewData } from './types'

const DEFAULT_ACCENT = 'border-t-blue-500'
// Une teinte PAR CARTE (demande Benoit 2026-09-22 : « des couleurs différentes entre chaque »).
// Les trois CA partageaient l'émeraude du code couleur « argent » : côte à côte, elles se
// lisaient comme une seule tuile en trois morceaux.
const KPI_ACCENTS: Record<string, string> = {
  ca: 'border-t-emerald-500',
  caMypuls: 'border-t-violet-500',
  caUncove: 'border-t-amber-500',
  active: DEFAULT_ACCENT,
  avgCa: 'border-t-rose-500',
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

      {/* Accent par CLÉ et non par position : le nombre de cartes varie (mode restreint, bouts
          `overview:*`, cartes CA par source de 0164) et un tableau positionnel décalait les
          couleurs dès qu'une carte apparaissait. Cinq colonnes UNIQUEMENT quand il y a cinq
          cartes — sinon (3 ou 4) elles s'étireraient en laissant un trou à droite. */}
      <KpiGrid
        kpis={data.kpis}
        accents={data.kpis.map((k) => KPI_ACCENTS[k.key] ?? DEFAULT_ACCENT)}
        columns={data.kpis.length === 5 ? 5 : 4}
      />

      <RevenueChart data={data.daily} periodLabel={data.periodLabel} scopeLabel={data.dailyScope} />
    </div>
  )
}
