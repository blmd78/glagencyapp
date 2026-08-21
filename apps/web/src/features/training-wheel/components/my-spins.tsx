import { frDateTimeParis, wheelWeekLabel } from '@glagency/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import type { MySpin } from '../types'

/**
 * « Mes gains » : les tirages du chatter, du plus récent au plus ancien. La colonne « Payé » ne
 * porte AUCUNE action — le versement se règle en compta, ici on ne fait qu'en rendre compte.
 * Un lot non monétaire (day off) n'a pas de montant : « — », et rien à verser.
 */
export function MySpins({ spins }: { spins: MySpin[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Mes gains</h2>
      {spins.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun tirage pour l’instant.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Date</TableHead>
                <TableHead className="w-28">Semaine</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead className="w-28 text-right">Montant</TableHead>
                <TableHead className="w-24">Payé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spins.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(s.spunAt)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{wheelWeekLabel(s.week)}</TableCell>
                  <TableCell className={s.won ? 'font-medium' : 'text-muted-foreground'}>
                    {s.won ? (s.prizeLabel ?? s.sectorLabel) : 'Raté'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.amountEur == null ? '—' : eur(s.amountEur)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {/* Rien à verser sur un Raté ou un lot non monétaire : la case reste vide. */}
                    {!s.won || s.amountEur == null ? '—' : s.paidAt ? '✓' : 'à venir'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
