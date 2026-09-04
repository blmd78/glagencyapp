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
 * Le roster de la promo, en DEUX ONGLETS — « En formation » (par défaut) et « En agence ».
 *
 * ILS ÉTAIENT EMPILÉS (deux sections l'une sous l'autre, jusqu'au 2026-09-04). En production, la
 * promo compte 245 chatteurs avec le droit Entraînement pour 58 en formation : le manager qui vient
 * lire sa file d'attente déroulait 245 lignes de 9 colonnes pour en trouver 58. « C'est illisible »
 * — d'où les onglets, qui n'en montrent qu'un à la fois, et les colonnes retirées (Points, Série et
 * Notées sont des chiffres de CLASSEMENT : ils vivent sur la fiche du chatter et au classement
 * hebdo, pas sur l'écran de pilotage).
 *
 * L'écran admin de Good Luck Agency (`adminFormation`, index.html:2510-2523) affichait l'inverse
 * (`body = secAgence + secForm`). Ordre inversé à la demande de Benoit (2026-09-02), et l'onglet
 * par défaut le confirme : ceux qui sont déjà en agence n'attendent plus rien de cette page, alors
 * que « En formation » est la FILE D'ATTENTE de l'agence.
 *
 * Chaque onglet est trié par AVANCEMENT DÉCROISSANT, comme le legacy (`_pctVal`,
 * index.html:2444-2445), avec les sans-note en dernier. Ici `totalCases` est le même pour tout le
 * monde : trier sur `casesDone` décroissant est strictement équivalent, sans avoir à recalculer un
 * pourcentage. L'ordre de la RPC (nouveaux d'abord puis nom, 0113:1427) ne sert plus qu'à
 * départager les ex æquo — `sort` est stable. Conséquence utile : le prochain à intégrer est la
 * première ligne du premier onglet.
 *
 * La bascule d'un onglet à l'autre suit le DRAPEAU `in_training` (0147), et non plus le
 * rattachement (`hasModel` chez eux, index.html:2443, `models.length > 0` ici). La déduction ne
 * tenait que tant que « Intégrer » rattachait une modèle dans le même geste : ce dialog a disparu,
 * une personne peut rester des semaines sans modèle sans être en formation, et l'inverse (en
 * formation avec une modèle d'essai) devient dicible.
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
  const enFormation = roster.filter((r) => r.inTraining).length
  return (
    <p className="text-sm text-muted-foreground">
      {roster.length} chatter{roster.length > 1 ? 's' : ''} sur la face Formation
      {enFormation > 0 && `, dont ${enFormation} encore en formation`}
      {newcomers > 0 && ` · ${newcomers} nouveau${newcomers > 1 ? 'x' : ''}`}
    </p>
  )
}

/**
 * Combien sont au-dessus du seuil « bientôt en agence » — la réponse à « combien arrivent ? »,
 * posée en sous-titre de l'onglet « En formation ». Exportée : c'est la Template qui compose les
 * onglets, elle a besoin du chiffre pour écrire la phrase.
 */
export function nearlyReadyCount(rows: RosterRow[], totalCases: number): number {
  return rows.filter((r) => progressOf(r, totalCases).pct >= NEARLY_READY_PCT).length
}

/** Le tri des deux onglets — avancement décroissant, `sort` stable (cf. le JSDoc du fichier). */
export const sortRoster = (rows: RosterRow[]): RosterRow[] => [...rows].sort(byProgress)

export { NEARLY_READY_PCT }

/**
 * Le tableau d'UN onglet. `withModel` ajoute la colonne « Modèle » — elle est vide par
 * construction sur « En formation » (chez GLA aussi : le paramètre `hideModel` de `section()`,
 * index.html:2512-2518).
 */
export function OverviewRosterTable({
  rows,
  totalCases,
  withModel,
  subtitle,
}: {
  rows: RosterRow[]
  totalCases: number
  withModel: boolean
  subtitle?: string | null
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Le `sub` de `section()` (index.html:2521) : une ligne de contexte. Le TITRE, lui, est
          devenu l'onglet — le répéter ici ferait doublon à trois centimètres d'écart. */}
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
                <TableHead className="w-28 text-center">Boss</TableHead>
                <TableHead className="w-32">Dernière session</TableHead>
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
                      {/* Intégré mais SANS le droit « Entraînement » : il ne peut pas avancer, et sa
                          ligne à 0 % ne le dirait pas. Il n'apparaît ici que depuis 0147, qui a
                          élargi la RPC — avant, il était simplement absent de l'écran. */}
                      {!r.hasTraining && (
                        <Badge variant="outline" className="ml-2 text-amber-700 dark:text-amber-400">
                          sans accès
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
                    <TableCell className="text-center tabular-nums">
                      {r.bossBest == null ? '—' : <ScoreBadge total={r.bossBest} />}
                      {r.bossDone && ' ✓'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lastSeen(r.lastSessionAt)}</TableCell>
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
