import { daysBetweenParis, frDateNumeric, frDayMonthParis } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RosterRow } from '../types'

/** « aujourd’hui / hier / il y a N j », puis la date passé un mois — lisible d'un coup d'œil. */
function lastSeen(iso: string | null): string {
  if (!iso) return 'jamais'
  const days = daysBetweenParis(iso, new Date().toISOString())
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  return frDayMonthParis(iso)
}

/**
 * Le roster de la promo : un chatter par ligne, nouveaux d'abord puis par nom (ordre de la RPC
 * 0119). Non cloisonné par modèle — qui a le droit Suivi voit toute la formation (spec §7) ;
 * la colonne « Modèles » sert de repère, pas de filtre.
 *
 * Le nom porte le lien vers la fiche (`?chatter=`) plutôt que la ligne entière : une `<tr>` ne
 * peut pas être un lien en HTML, et un handler de clic sur la ligne ferait de ce tableau une
 * feuille cliente pour rien.
 */
export function OverviewRoster({ roster, totalCases }: { roster: RosterRow[]; totalCases: number }) {
  const newcomers = roster.filter((r) => r.isNew).length
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {roster.length} chatter{roster.length > 1 ? 's' : ''} en formation
        {newcomers > 0 && `, ${newcomers} nouveau${newcomers > 1 ? 'x' : ''}`}
      </p>
      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Personne n’a encore le droit « Entraînement » — attribue-le depuis Membres.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chatter</TableHead>
                <TableHead>Modèles</TableHead>
                <TableHead className="w-24 text-right">Cas</TableHead>
                <TableHead className="w-24 text-right">Moyenne</TableHead>
                <TableHead className="w-20 text-right">Points</TableHead>
                <TableHead className="w-20 text-right">Série</TableHead>
                <TableHead className="w-20 text-center">Boss</TableHead>
                <TableHead className="w-32">Dernière session</TableHead>
                <TableHead className="w-20 text-right">Notées</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((r) => (
                <TableRow key={r.profileId}>
                  <TableCell>
                    {/* `as Route` : typedRoutes n'accepte pas une chaîne interpolée. */}
                    <Link href={`/formation/overview?chatter=${r.profileId}` as Route} className="font-medium hover:underline">
                      {r.displayName}
                    </Link>
                    {r.isNew && (
                      <Badge variant="outline" className="ml-2">
                        nouveau{r.arrivedAt ? ` · ${frDateNumeric(r.arrivedAt)}` : ''}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.models.length > 0 ? r.models.join(', ') : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.casesDone}/{Math.max(totalCases, r.casesDone)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.avgTotal == null ? '—' : Math.round(r.avgTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.points}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.streakDays} j</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {r.bossBest == null ? '—' : `${r.bossBest}${r.bossDone ? ' ✓' : ''}`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lastSeen(r.lastSessionAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sessionsScored}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
