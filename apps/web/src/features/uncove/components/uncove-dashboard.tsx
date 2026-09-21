import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { eur, num } from '@/lib/format'
import { STATUS_COLORS } from '@/lib/status-color'
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modèle</TableHead>
              <TableHead className="text-right">Abonnés</TableHead>
              <TableHead className="text-right">Nouveaux</TableHead>
              <TableHead className="text-right">Désabos</TableHead>
              <TableHead className="text-right">CA ({periodDays} j)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {a.label}
                    {a.status === 'reconnect' && (
                      <Badge className={cn('text-xs', STATUS_COLORS.danger)}>à reconnecter</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{num(a.currentSubs)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(a.newSubs)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(a.canceledSubs)}</TableCell>
                <TableCell className="text-right tabular-nums">{eur(a.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
