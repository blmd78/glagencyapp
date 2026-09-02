import { daysBetweenParis, frDateNumeric, frDayMonthParis } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { ScoreBadge } from '@/components/training/score-badge'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
 * Seuil « bientôt en agence » : au-delà, le chatter a fini l'essentiel du catalogue et devient
 * une intégration à préparer. Purement INDICATIF (aucune règle métier ne s'y accroche — l'entrée
 * en agence reste un rattachement manuel à une modèle) : c'est le chiffre que l'encadrement veut
 * lire en haut de page, « combien arrivent ».
 */
const NEARLY_READY_PCT = 80

/** Avancement en % du catalogue. Dénominateur défensif : un import legacy peut dépasser le total. */
function progressOf(row: RosterRow, totalCases: number) {
  const total = Math.max(totalCases, row.casesDone)
  return { total, pct: total === 0 ? 0 : Math.round((row.casesDone / total) * 100) }
}

/**
 * Barre VERTE pour tout le monde, quel que soit l'avancement : c'est le rendu de Good Luck Agency
 * (`barMini` sans couleur explicite → `var(--accent)` = `#13C57A`, index.html:2440 et :14).
 *
 * Un dégradé par palier a été essayé puis retiré (2026-09-02) : il ferait dire à la couleur ce que
 * la LONGUEUR de la barre dit déjà, et le tri par avancement décroissant suffit à faire remonter
 * ceux qui arrivent. Ne pas non plus brancher `scoreColor` (`lib/training/score-color.ts`) ici :
 * ce feu tricolore-là juge une NOTE et passe au rouge sous 60 — un chatter à 30 % du catalogue
 * n'a rien raté, il vient d'arriver.
 */
const PROGRESS_BAR_COLOR = 'bg-green-600'

/**
 * Le roster de la promo, en DEUX sections — « En formation » puis « Attribués à une modèle ».
 *
 * L'écran admin de Good Luck Agency (`adminFormation`, index.html:2510-2523) affichait l'inverse
 * (`body = secAgence + secForm`). Ordre inversé à la demande de Benoit (2026-09-02) : ceux qui
 * sont déjà en agence n'attendent plus rien de cette page, alors que « En formation » est la
 * FILE D'ATTENTE de l'agence — c'est elle qu'on vient lire, elle passe donc en premier.
 *
 * Chaque section est triée par AVANCEMENT DÉCROISSANT, comme le legacy (`_pctVal`,
 * index.html:2444-2445), avec les sans-note en dernier. Ici `totalCases` est le même pour tout le
 * monde : trier sur `casesDone` décroissant est strictement équivalent, sans avoir à recalculer un
 * pourcentage. L'ordre de la RPC (nouveaux d'abord puis nom, 0113:1427) ne sert plus qu'à
 * départager les ex æquo — `sort` est stable. Conséquence utile : le prochain à intégrer est la
 * première ligne du premier tableau de la page.
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
const byProgress = (a: RosterRow, b: RosterRow) => b.casesDone - a.casesDone

/**
 * Le décompte de la promo — rendu par la Template EN HAUT de page (au-dessus des signalements),
 * pas ici : c'est une phrase de cadrage, elle se lit avec les chiffres, pas avec les tableaux.
 */
export function OverviewRosterCount({ roster }: { roster: RosterRow[] }) {
  const newcomers = roster.filter((r) => r.isNew).length
  const enFormation = roster.filter((r) => r.models.length === 0).length
  return (
    <p className="text-sm text-muted-foreground">
      {roster.length} chatter{roster.length > 1 ? 's' : ''} sur la face Formation
      {enFormation > 0 && `, dont ${enFormation} encore en formation`}
      {newcomers > 0 && ` · ${newcomers} nouveau${newcomers > 1 ? 'x' : ''}`}
    </p>
  )
}

export function OverviewRoster({ roster, totalCases }: { roster: RosterRow[]; totalCases: number }) {
  const sorted = [...roster].sort(byProgress)
  const enAgence = sorted.filter((r) => r.models.length > 0)
  const enFormation = sorted.filter((r) => r.models.length === 0)
  // La réponse à « combien arrivent ? », posée au-dessus du tableau qui la détaille.
  const nearly = enFormation.filter((r) => progressOf(r, totalCases).pct >= NEARLY_READY_PCT).length
  return (
    <section className="flex flex-col gap-6">
      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Personne n’a encore le droit « Entraînement » — attribue-le depuis Membres.
        </p>
      ) : (
        <>
          <RosterSection
            title="En formation"
            subtitle={
              enFormation.length === 0
                ? null
                : nearly === 0
                  ? `Personne au-dessus de ${NEARLY_READY_PCT} % pour l’instant`
                  : `${nearly} au-dessus de ${NEARLY_READY_PCT} % — bientôt en agence`
            }
            rows={enFormation}
            totalCases={totalCases}
            withModel={false}
          />
          <RosterSection title="Attribués à une modèle" subtitle={null} rows={enAgence} totalCases={totalCases} withModel />
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
  subtitle,
  rows,
  totalCases,
  withModel,
}: {
  title: string
  subtitle: string | null
  rows: RosterRow[]
  totalCases: number
  withModel: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="flex items-baseline gap-2 text-sm font-semibold">
          {title}
          <span className="text-xs font-bold text-muted-foreground">{rows.length}</span>
        </h3>
        {/* Le `sub` de `section()` (index.html:2521) : une ligne de contexte sous le titre. */}
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
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
                <TableHead className="w-56">Progression</TableHead>
                <TableHead className="w-24 text-right">Moyenne</TableHead>
                <TableHead className="w-20 text-right">Points</TableHead>
                <TableHead className="w-20 text-right">Série</TableHead>
                <TableHead className="w-28 text-center">Boss</TableHead>
                <TableHead className="w-32">Dernière session</TableHead>
                <TableHead className="w-20 text-right">Notées</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const { total, pct } = progressOf(r, totalCases)
                return (
                  <TableRow key={r.profileId}>
                    <TableCell>
                      {/* `as Route` : typedRoutes n'accepte pas une chaîne interpolée. */}
                      <Link
                        href={`/formation/overview?chatter=${r.profileId}` as Route}
                        className="font-medium hover:underline"
                      >
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
                    {/* La barre de GLA (`barMini`, index.html:2440) : une seule couleur, le % à
                        côté, le décompte de cas en second plan. Le chiffre brut `12/40` seul
                        obligeait à faire la division de tête pour comparer deux chatters. */}
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Progress
                          value={pct}
                          className="h-1.5 w-24"
                          indicatorClassName={PROGRESS_BAR_COLOR}
                          label={`Progression de ${r.displayName}`}
                        />
                        <span className="w-10 text-right font-medium tabular-nums">{pct} %</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {r.casesDone}/{total}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.avgTotal == null ? '—' : Math.round(r.avgTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.points}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.streakDays} j</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {r.bossBest == null ? '—' : <ScoreBadge total={r.bossBest} />}
                      {r.bossDone && ' ✓'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lastSeen(r.lastSessionAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.sessionsScored}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
