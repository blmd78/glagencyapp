import { daysBetweenParis, frDateNumeric, frDayMonthParis } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { ScoreBadge } from '@/components/training/score-badge'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { modelColor } from '@/lib/model-color'
import { cn } from '@/lib/utils'
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
 * Le roster de la promo, dans la forme de l'écran admin de Good Luck Agency
 * (`adminFormation`, index.html:2510-2523) : DEUX sections dans CET ordre — « Attribués à une
 * modèle » puis « En formation » — chacune triée par AVANCEMENT DÉCROISSANT.
 *
 * Le legacy triait sur `global_pct` (`_pctVal`, index.html:2444-2445), avec les sans-note en
 * dernier. Ici `totalCases` est le même pour tout le monde : trier sur `casesDone` décroissant est
 * strictement équivalent, sans avoir à recalculer un pourcentage. L'ordre de la RPC (nouveaux
 * d'abord puis nom, 0113:1427) ne sert plus qu'à départager les ex æquo — `sort` est stable.
 *
 * La bascule d'une section à l'autre suit le RATTACHEMENT, pas la date : `hasModel` chez eux
 * (index.html:2443), `models.length > 0` ici — la même chose, sans liste de prénoms en dur.
 *
 * Non cloisonné par modèle — qui a le droit Suivi voit toute la formation (spec §7).
 *
 * Le nom porte le lien vers la fiche (`?chatter=`) plutôt que la ligne entière : une `<tr>` ne
 * peut pas être un lien en HTML, et un handler de clic sur la ligne ferait de ce tableau une
 * feuille cliente pour rien.
 */
/** Tri de GLA : avancement décroissant (`index.html:2444-2445`). `sort` est stable → l'ordre de la RPC départage. */
const byProgress = (a: RosterRow, b: RosterRow) => b.casesDone - a.casesDone

/**
 * Le décompte de la promo — rendu par la Template EN HAUT de page (au-dessus des signalements),
 * pas ici : c'est une phrase de cadrage, elle se lit avec les chiffres, pas avec les tableaux.
 */
export function OverviewRosterCount({ roster }: { roster: RosterRow[] }) {
  const newcomers = roster.filter((r) => r.isNew).length
  return (
    <p className="text-sm text-muted-foreground">
      {roster.length} chatter{roster.length > 1 ? 's' : ''} sur la face Formation
      {newcomers > 0 && `, ${newcomers} nouveau${newcomers > 1 ? 'x' : ''}`}
    </p>
  )
}

export function OverviewRoster({ roster, totalCases }: { roster: RosterRow[]; totalCases: number }) {
  const sorted = [...roster].sort(byProgress)
  const enAgence = sorted.filter((r) => r.models.length > 0)
  const enFormation = sorted.filter((r) => r.models.length === 0)
  return (
    <section className="flex flex-col gap-6">
      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Personne n’a encore le droit « Entraînement » — attribue-le depuis Membres.
        </p>
      ) : (
        <>
          {/* « Attribués » EN PREMIER : `body = secAgence + secForm` (index.html:2523). */}
          <RosterSection title="Attribués à une modèle" rows={enAgence} totalCases={totalCases} withModel />
          <RosterSection title="En formation" rows={enFormation} totalCases={totalCases} withModel={false} />
        </>
      )}
    </section>
  )
}

/**
 * Une section du roster. `withModel` ajoute la colonne « Modèle » — chez GLA le rattachement
 * n'était montré que dans la section « Attribués » (le paramètre `hideModel` de `section()`,
 * index.html:2512-2518), puisqu'il est vide par construction dans l'autre.
 */
function RosterSection({
  title,
  rows,
  totalCases,
  withModel,
}: {
  title: string
  rows: RosterRow[]
  totalCases: number
  withModel: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        {title}
        <span className="text-xs font-bold text-muted-foreground">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        // « Personne ici. » — le vide de GLA (index.html:2516), qui dit que la section existe.
        <p className="rounded-md border px-4 py-4 text-sm text-muted-foreground">Personne ici.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chatter</TableHead>
                {withModel && <TableHead className="w-32">Modèle</TableHead>}
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
              {rows.map((r) => (
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
                  {withModel && (
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1">
                        {r.models.map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 text-sm">
                            <span aria-hidden className={cn('inline-block size-2 rounded-full', modelColor(m))} />
                            {m}
                          </span>
                        ))}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {r.casesDone}/{Math.max(totalCases, r.casesDone)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.avgTotal == null ? '—' : Math.round(r.avgTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.points}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.streakDays} j</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {r.bossBest == null ? '—' : <ScoreBadge total={r.bossBest} />}
                    {r.bossDone && ' ✓'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lastSeen(r.lastSessionAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sessionsScored}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
