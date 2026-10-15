import { frDateTimeParis, wheelWeekLabel } from '@glagency/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import type { ChatterGains, WheelHistory as WheelHistoryData } from '../types'

/**
 * Historique encadrant (droit Suivi) : tous les tirages, groupés par semaine RÉCOMPENSÉE, la plus
 * récente dépliée. Aucun bouton « payer » — le versement se règle en compta (décision du plan) ;
 * cette page ne fait que dire ce qui est dû.
 */
export function WheelHistory({ history }: { history: WheelHistoryData }) {
  if (history.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun tirage sur cette période.</p>
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Total gagné : <span className="font-medium tabular-nums text-foreground">{eur(history.totalEur)}</span> ({history.rows.length} tirages)
      </p>
      <GainsParChatteur gains={history.byChatter} titre="Gains par chatteur sur la période" />
      <div className="flex flex-col gap-3">
        {history.byWeek.map((w, i) => (
          <details key={w.week} open={i === 0} className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{wheelWeekLabel(w.week)}</span>{' '}
              <span className="text-muted-foreground">
                — {w.count} tirage{w.count > 1 ? 's' : ''}, {eur(w.totalEur)}
              </span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <GainsParChatteur gains={w.byChatter} titre="Gains par chatteur" />
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chatter</TableHead>
                      <TableHead className="w-32">Date</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead className="w-44">Origine</TableHead>
                      <TableHead className="w-32">Lancé par</TableHead>
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
                          <TableCell className="text-muted-foreground">{r.origine}</TableCell>
                          {/* Le seul garde-fou du modèle « accès libre » : chaque versement est imputable. */}
                          <TableCell className="text-muted-foreground">{r.spunByName ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.amountEur == null ? '—' : eur(r.amountEur)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {!r.won || r.amountEur == null ? '—' : r.paidAt ? '✓' : 'à venir'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

/**
 * Récap compta : un chatteur par ligne et ce qu'il a gagné en tout, pour payer sans additionner le
 * détail à la main. Rien quand personne n'a gagné d'argent.
 */
function GainsParChatteur({ gains, titre }: { gains: ChatterGains[]; titre: string }) {
  if (gains.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{titre}</p>
      <div className="max-w-md rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chatter</TableHead>
              <TableHead className="w-28 text-right">Total gagné</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gains.map((g) => (
              <TableRow key={g.profileId}>
                <TableCell className="font-medium">{g.displayName}</TableCell>
                <TableCell className="text-right tabular-nums">{eur(g.totalEur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
