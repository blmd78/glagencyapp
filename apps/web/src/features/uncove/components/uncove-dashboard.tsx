import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UncoveDashboardData } from '../types'

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('fr-FR')

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function UncoveDashboard({ data }: { data: UncoveDashboardData }) {
  const { totals, accounts, periodDays } = data
  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Abonnés actifs" value={num.format(totals.currentSubs)} />
        <Kpi label={`Nouveaux abonnés (${periodDays} j)`} value={num.format(totals.newSubs)} />
        <Kpi label={`CA (${periodDays} j)`} value={eur.format(totals.revenue)} />
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun compte Uncove relevé pour le moment.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Compte</TableHead>
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
                  {a.label}
                  {a.status === 'reconnect' && (
                    <Badge variant="destructive" className="ml-2 align-middle">à reconnecter</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{num.format(a.currentSubs)}</TableCell>
                <TableCell className="text-right tabular-nums">{num.format(a.newSubs)}</TableCell>
                <TableCell className="text-right tabular-nums">{num.format(a.canceledSubs)}</TableCell>
                <TableCell className="text-right tabular-nums">{eur.format(a.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
