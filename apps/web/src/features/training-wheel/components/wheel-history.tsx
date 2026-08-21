import { frDateTimeParis, wheelWeekLabel } from '@glagency/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import type { WheelHistory as WheelHistoryData } from '../types'

/**
 * Historique encadrant (droit Suivi) : tous les tirages, groupés par semaine RÉCOMPENSÉE, la plus
 * récente dépliée. Aucun bouton « payer » — le versement se règle en compta (décision du plan) ;
 * cette page ne fait que dire ce qui est dû.
 */
export function WheelHistory({ history }: { history: WheelHistoryData }) {
  if (history.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun tirage pour l’instant.</p>
  }
  return (
    <section className="flex flex-col gap-4">
      {/* La requête est bornée à 200 lignes : le dire, plutôt qu'afficher un total qui plafonnerait
          en silence. */}
      <p className="text-sm text-muted-foreground">
        Total gagné : <span className="font-medium tabular-nums text-foreground">{eur(history.totalEur)}</span> ({history.rows.length} tirages,
        200 dernières lignes)
      </p>
      <div className="flex flex-col gap-3">
        {history.byWeek.map((w, i) => (
          <details key={w.week} open={i === 0} className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{wheelWeekLabel(w.week)}</span>{' '}
              <span className="text-muted-foreground">
                — {w.count} tirage{w.count > 1 ? 's' : ''}, {eur(w.totalEur)}
              </span>
            </summary>
            <div className="mt-3 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chatter</TableHead>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead className="w-28 text-right">Montant</TableHead>
                    <TableHead className="w-24">Payé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.rows
                    .filter((r) => r.week === w.week)
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.displayName}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(r.spunAt)}</TableCell>
                        <TableCell className={r.won ? undefined : 'text-muted-foreground'}>{r.won ? (r.prizeLabel ?? '—') : 'Raté'}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.amountEur == null ? '—' : eur(r.amountEur)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {!r.won || r.amountEur == null ? '—' : r.paidAt ? '✓' : 'à venir'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
