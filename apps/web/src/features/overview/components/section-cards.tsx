import { KpiCard } from './kpi-card'
import type { Kpi } from '../types'

/** Grille des cartes KPI : compose des <KpiCard>, sans logique d'affichage propre. */
export function SectionCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  )
}
