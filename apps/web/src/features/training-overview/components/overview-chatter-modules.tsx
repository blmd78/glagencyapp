import { frDateNumeric } from '@glagency/core'
import { DifficultyBars } from '@/components/training/difficulty-bars'
import { ScoreBadge } from '@/components/training/score-badge'
import { CollapsibleSection } from '@/components/collapsible-section'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import type { CaseProgress, ModuleProgress } from '../types'

/**
 * Le parcours d'un chatter, MODULE PAR MODULE — la reprise, côté encadrant, de l'organisation que
 * le chatter voit dans Modules : module → compétence → cas triés par difficulté croissante
 * (`training-modules/components/cases-list.tsx:16-22`).
 *
 * Il y avait ici un tableau PLAT des cas tentés, avec le module en colonne : 85 lignes mélangées,
 * où rien ne disait à quel endroit du parcours quelqu'un butait. Demandé par Benoit le 2026-09-04,
 * « pour la lisibilité ».
 *
 * DEUX CHOSES QUE LE TABLEAU PLAT NE POUVAIT PAS DIRE :
 *  • les cas JAMAIS TENTÉS. Ils viennent du catalogue (`get-chatter.ts`), pas des notes, et
 *    s'affichent en gris avec un tiret — le trou dans le parcours est souvent la vraie question ;
 *  • le NIVEAU où ça coince : les cas montent par difficulté croissante et portent leurs barres
 *    de signal (`DifficultyBars`, mode GLA — la position dans la liste), donc « bon au début,
 *    plante en haut du module » se lit sur la colonne des notes, sans rien calculer.
 *
 * Tout est fermé au chargement : sept modules ouverts feraient exactement l'écran illisible qu'on
 * vient de défaire.
 *
 * Moyennes calculées sur les cas TENTÉS (cf. `get-chatter.ts`) ; le compteur, lui, dit
 * `tentés/total` — la même définition que le `12/40` du roster (`cases_done`, 0113:1211), pour ne
 * pas avoir deux sens de « fait » sur le même écran.
 */
export function OverviewChatterModules({ modules }: { modules: ModuleProgress[] }) {
  if (modules.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun module actif dans le catalogue.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {modules.map((m) => (
        <CollapsibleSection
          key={m.code}
          density="confortable"
          trigger={
            <Summary
              title={m.emoji ? `${m.emoji} ${m.title}` : m.title}
              avg={m.avg}
              attempted={m.attempted}
              total={m.total}
            />
          }
        >
          {/* Un seul groupe anonyme = module sans compétence : on saute un niveau de dépliage. */}
          {m.groups.length === 1 && m.groups[0].id === null ? (
            <Levels cases={m.groups[0].cases} />
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {m.groups.map((g) => (
                <CollapsibleSection
                  key={g.id ?? 'hors-competence'}
                  trigger={<Summary title={g.title} avg={g.avg} attempted={g.attempted} total={g.total} />}
                >
                  <Levels cases={g.cases} />
                </CollapsibleSection>
              ))}
            </div>
          )}
        </CollapsibleSection>
      ))}
    </div>
  )
}

/** L'en-tête d'un module ou d'une compétence : le nom à gauche, ce qu'il vaut à droite. */
function Summary({
  title,
  avg,
  attempted,
  total,
}: {
  title: string
  avg: number | null
  attempted: number
  total: number
}) {
  return (
    <span className="flex flex-1 items-baseline justify-between gap-3">
      <span>{title}</span>
      <span className="flex items-baseline gap-3 text-sm font-normal text-muted-foreground">
        {/* « — » et pas « 0 » : rien de tenté n'est pas une mauvaise note. */}
        <span className="tabular-nums">{avg == null ? '—' : `moy. ${Math.round(avg)}`}</span>
        <span className="tabular-nums">
          {attempted}/{total}
        </span>
      </span>
    </span>
  )
}

/**
 * Les cas d'un groupe, du plus facile au plus dur, LE NIVEAU SUR LA LIGNE.
 *
 * Un intertitre « Niveau N » a été essayé puis retiré (2026-09-04) : vérification faite en base,
 * une compétence tient exactement un cas par niveau (4 cas, 4 niveaux) et « Demande de rencontre »
 * en aurait dix pour onze lignes. L'intertitre aurait donc surtout ajouté des lignes vides entre
 * les cas. Les barres de signal disent le même niveau, à leur place, sur la ligne du cas — et
 * c'est déjà ce que le chatter voit dans Modules.
 */
function Levels({ cases }: { cases: CaseProgress[] }) {
  if (cases.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">Aucun cas ici.</p>
  }
  return (
    <ul className="divide-y">
      {cases.map((c, i) => (
        <CaseLine key={c.caseId} c={c} index={i} total={cases.length} />
      ))}
    </ul>
  )
}

/** Une ligne de cas. Jamais tenté = tout en gris, un tiret à la place de la note. */
function CaseLine({ c, index, total }: { c: CaseProgress; index: number; total: number }) {
  const untouched = c.bestTotal == null
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      {/* Mode GLA (`index`/`total`) : la montée DANS le groupe, pas la difficulté absolue — c'est
          le même rendu que la liste des cas côté chatter. */}
      <DifficultyBars difficulty={c.difficulty} index={index} total={total} />
      <span className={untouched ? 'flex-1 text-muted-foreground' : 'flex-1 font-medium'}>{c.title}</span>
      {/* La sorte n'est rappelée que quand elle sort de l'ordinaire — un solo, c'est le défaut. */}
      {c.kind !== 'solo' && <span className="text-xs text-muted-foreground">{CASE_KIND_LABELS[c.kind]}</span>}
      {untouched ? (
        <span className="w-32 text-right text-muted-foreground">jamais tenté</span>
      ) : (
        <span className="flex w-32 items-center justify-end gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {c.attempts} essai{c.attempts > 1 ? 's' : ''}
          </span>
          <ScoreBadge total={c.bestTotal ?? 0} />
        </span>
      )}
      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
        {c.lastAt ? frDateNumeric(c.lastAt) : ''}
      </span>
    </li>
  )
}
