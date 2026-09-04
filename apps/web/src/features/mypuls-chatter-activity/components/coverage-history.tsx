import { SLOT_LABEL, frDayMonthShort, held, type SlotKey } from '@glagency/core'
import { int, pct } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { STATUS_COLORS } from '@/lib/status-color'
import type { ChatterCoverageDay } from '../types'

// Formateur HOISTÉ (cf. lib/format) : en construire un par cellule est ~70× plus lent.
const HHMM = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const clock = (iso: string | null) => (iso ? HHMM.format(new Date(iso)) : '—')

/**
 * La couverture jour par jour, sur le mois glissant.
 *
 * Table serveur et non `DataTable` : une trentaine de lignes, aucun filtre, aucun tri à faire —
 * le tri chronologique est le seul qui ait du sens ici. Y mettre TanStack coûterait du
 * JavaScript client pour rien.
 *
 * Les créneaux qui ne sont pas le sien apparaissent, atténués et sans verdict : c'est du
 * renfort, pas un manquement.
 */
export function CoverageHistory({
  coverage,
  expected,
  threshold,
}: {
  coverage: ChatterCoverageDay[]
  expected: SlotKey | null
  /** Seuil du run, jamais 80 en dur : le relevé d'équipe utilise le même. */
  threshold: number
}) {
  if (coverage.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Couverture jour par jour</h2>
        <p className="text-sm text-muted-foreground">
          Aucune activité relevée sur le mois glissant.
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        Couverture jour par jour{' '}
        <span className="text-muted-foreground">({coverage.length} créneau(x))</span>
      </h2>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jour</TableHead>
              <TableHead>Créneau</TableHead>
              <TableHead className="text-right">Couverture</TableHead>
              <TableHead className="text-right">Temps actif</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead>Plage</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coverage.map((c) => {
              const own = expected !== null && c.slot === expected
              return (
                <TableRow key={`${c.day}:${c.slot}`} className={own ? undefined : 'opacity-60'}>
                  <TableCell className="tabular-nums">{frDayMonthShort(c.day)}</TableCell>
                  <TableCell>{SLOT_LABEL[c.slot]}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Progress value={c.coveragePct} className="h-1.5 w-16" />
                      <span className="tabular-nums">{pct(c.coveragePct)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.activeMinutes} min</TableCell>
                  <TableCell className="text-right tabular-nums">{int(c.messages)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {clock(c.firstAt)} → {clock(c.lastAt)}
                  </TableCell>
                  <TableCell>
                    {own ? (
                      <Badge
                        className={
                          held(c.coveragePct, threshold) ? STATUS_COLORS.positive : STATUS_COLORS.warning
                        }
                      >
                        {held(c.coveragePct, threshold) ? 'Poste tenu' : 'Sous le seuil'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Renfort</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
