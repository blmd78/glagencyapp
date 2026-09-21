import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur, num } from '@/lib/format'
import { UncoveStatsTable } from './uncove-stats-table.client'
import type { UncoveDashboardData } from '../types'

export function UncoveDashboard({ data }: { data: UncoveDashboardData }) {
  const { totals, accounts, periodDays } = data
  const base = { deltaPct: null as number | null, trendLabel: '' }
  const kpis: Kpi[] = [
    {
      ...base,
      key: 'subs',
      label: 'Abonnés actifs',
      value: num(totals.currentSubs),
      hint: 'tous comptes confondus',
      info: 'Somme des abonnés actifs (« current ») au dernier jour relevé de chaque compte Uncove.',
    },
    { ...base, key: 'new', label: 'Nouveaux abonnés', value: num(totals.newSubs), hint: `${periodDays} derniers jours` },
    { ...base, key: 'cancel', label: 'Désabonnements', value: num(totals.canceledSubs), hint: `${periodDays} derniers jours` },
    {
      ...base,
      key: 'ca',
      label: 'CA',
      value: eur(totals.revenue),
      hint: `${periodDays} derniers jours`,
      info: 'Somme du CA quotidien (transactions/volumes) de tous les comptes sur la période.',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={kpis} />

      {/* Invariant : un relevé absent s'annonce, il ne se déguise pas en zéros. */}
      {accounts.length === 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium">Aucun compte Uncove relevé.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute un modèle dans l&apos;onglet « Modèles » (colle son <code>user_token</code>) — les
            chiffres apparaîtront au prochain relevé.
          </p>
        </div>
      ) : (
        <UncoveStatsTable accounts={accounts} periodDays={periodDays} />
      )}
    </div>
  )
}
