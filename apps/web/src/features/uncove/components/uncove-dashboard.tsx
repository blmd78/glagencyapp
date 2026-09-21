import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur, num } from '@/lib/format'
import { UncoveStatsTable } from './uncove-stats-table.client'
import type { UncoveDashboardData } from '../types'

export function UncoveDashboard({ data }: { data: UncoveDashboardData }) {
  const { totals, accounts, periodLabel } = data
  const base = { deltaPct: null as number | null, trendLabel: '' }
  const kpis: Kpi[] = [
    {
      ...base,
      key: 'subs',
      label: 'Abonnés actifs',
      value: num(totals.currentSubs),
      hint: 'fin de période, tous comptes',
      info: 'Abonnés actifs (« current ») au dernier jour de la période, sommés sur tous les comptes.',
    },
    { ...base, key: 'new', label: 'Nouveaux abonnés', value: num(totals.newSubs), hint: periodLabel },
    { ...base, key: 'cancel', label: 'Désabonnements', value: num(totals.canceledSubs), hint: periodLabel },
    {
      ...base,
      key: 'ca',
      label: 'CA',
      value: eur(totals.revenue),
      hint: periodLabel,
      info: 'Somme du CA quotidien (transactions/volumes) de tous les comptes sur la période choisie.',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={kpis} />

      {/* Invariant : un relevé absent s'annonce, il ne se déguise pas en zéros. */}
      {accounts.length === 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium">Aucun compte Uncove sur cette période.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute un modèle dans l&apos;onglet « Modèles » (colle son <code>user_token</code>), ou choisis
            une autre période — les chiffres apparaissent au fil des relevés.
          </p>
        </div>
      ) : (
        <UncoveStatsTable accounts={accounts} />
      )}
    </div>
  )
}
