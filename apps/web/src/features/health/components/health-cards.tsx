import { KpiCard, type Kpi } from '@/components/kpi-card'

// Liseré coloré par carte (ordre = ordre des KPIs).
const ACCENTS = [
  'border-t-emerald-500',
  'border-t-blue-500',
  'border-t-violet-500',
  'border-t-amber-500',
]

/** Grille des cartes KPI santé : compose des <KpiCard>, sans logique d'affichage propre. */
export function HealthCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <KpiCard key={kpi.key} kpi={kpi} accent={ACCENTS[i % ACCENTS.length]} />
      ))}
    </div>
  )
}
