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
  // La requête est bornée à `HISTORY_LIMIT` : au-delà, les totaux hebdo tronqués ne doivent pas se
  // présenter comme exacts (revue finale — voir le commentaire de `truncated` dans `types.ts`).
  // Silencieux quand ce n'est pas le cas : pas d'avertissement à demeure sur un écran de compta.
  const lastWeekIndex = history.byWeek.length - 1

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Total gagné : <span className="font-medium tabular-nums text-foreground">{eur(history.totalEur)}</span> ({history.rows.length} tirages
        {history.truncated ? ', 200 dernières lignes' : ''})
      </p>
      <div className="flex flex-col gap-3">
        {history.byWeek.map((w, i) => (
          <details key={w.week} open={i === 0} className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{wheelWeekLabel(w.week)}</span>{' '}
              <span className="text-muted-foreground">
                — {w.count} tirage{w.count > 1 ? 's' : ''}, {eur(w.totalEur)}
              </span>
              {/* Seule la semaine la PLUS ANCIENNE affichée peut être coupée : c'est celle dont les
                  tirages les plus vieux tombent hors des 200 lignes rapatriées. */}
              {history.truncated && i === lastWeekIndex && (
                <span className="text-amber-600 dark:text-amber-400"> — total partiel, au-delà des 200 dernières lignes</span>
              )}
            </summary>
            <div className="mt-3 rounded-md border">
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
          </details>
        ))}
      </div>
    </section>
  )
}
