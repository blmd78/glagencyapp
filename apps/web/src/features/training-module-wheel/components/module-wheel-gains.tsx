import { frDateTimeParis } from '@glagency/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import type { ModuleWheelSpin } from '../types'

/**
 * Les tours déjà joués par le visiteur, et ce qu'ils lui ont rapporté.
 *
 * Titre « … sur cette roue » (pas juste « Mes gains ») : `totalEur` ne compte QUE les tours de
 * la roue des modules — les deux roues du CRM écrivent dans la même `training_wheel_spins`, donc
 * un chatter à qui un encadrant a fait tourner l'AUTRE roue a des gains que cette somme ignore.
 * Un titre générique laisserait croire que c'est son total réel.
 */
export function ModuleWheelGains({ spins, totalEur }: { spins: ModuleWheelSpin[]; totalEur: number }) {
  if (spins.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Mes gains sur cette roue</h2>
        <p className="text-sm text-muted-foreground">Aucun tour joué pour l’instant.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Mes gains sur cette roue</h2>
      <p className="text-sm text-muted-foreground">
        Total gagné : <span className="font-medium tabular-nums text-foreground">{eur(totalEur)}</span> sur {spins.length} tour
        {spins.length > 1 ? 's' : ''}
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Date</TableHead>
              {/* « Origine » : même libellé que la colonne homologue de l'historique encadrant
                  (`wheel-history.tsx`) — c'est la même donnée (le libellé du ticket consommé /
                  « Encadrant »), les deux écrans doivent la nommer pareil. */}
              <TableHead>Origine</TableHead>
              <TableHead className="w-28 text-right">Gain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spins.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(s.spunAt)}</TableCell>
                <TableCell>{s.reason ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.amountEur == null ? '—' : eur(s.amountEur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
