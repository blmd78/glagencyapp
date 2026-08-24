import { BOSS_UNLOCK_AVG, bossUnlocked, medalFor } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { DifficultyBars } from '@/components/training/difficulty-bars'
import { PlayButton } from '@/components/training/play-button'
import { MEDAL_EMOJI } from '@/lib/types/training'
import type { MyBest } from '../services/get-my-bests'
import type { ModuleDetail, PublicCase } from '../types'

/**
 * Les cas d'un module — structure de l'app Good Luck Agency (`render.formationModule`) : des
 * listes encadrées (`.clist`) plutôt que des cartes, une ligne par cas avec les barres de niveau à
 * gauche, le titre et sa phase, la médaille et le chevron à droite.
 *
 * Les cas sont triés PAR DIFFICULTÉ croissante (et non par position) : c'est ce que fait GLA, et
 * c'est ce qui donne le sentiment de progression — on monte les niveaux d'un module.
 *
 * DEUX NIVEAUX quand le module a des COMPÉTENCES (`sections` — Setting en a 6, Relationnel 4) :
 * la page liste alors les compétences, et `?competence=<id>` ouvre les exercices de l'une d'elles
 * (GLA `formationSousCat`). Vingt-deux cas d'affilée, sans regroupement, ne se lisent pas — et la
 * compétence est l'unité que les chatteurs travaillent.
 *
 * `canPlay` = droit Entraînement : un encadrant Suivi seul voit les cas SANS bouton (et sans
 * médaille : `bests` est vide pour lui).
 */
export function CasesList({
  module,
  canPlay,
  bests,
  avgTotal,
  competenceId,
}: {
  module: ModuleDetail
  canPlay: boolean
  bests: Map<string, MyBest>
  avgTotal: number | null
  /** Compétence ouverte (`?competence=`) — `null` = vue du module. */
  competenceId: string | null
}) {
  const allSolos = [...module.cases.filter((c) => c.kind === 'solo')].sort((a, b) => a.difficulty - b.difficulty)
  const competence = competenceId ? module.sections.find((sec) => sec.id === competenceId) : null

  // Une compétence est ouverte : on ne montre QUE ses exercices, avec le retour vers le module.
  if (competence) {
    const cases = allSolos.filter((c) => c.sectionId === competence.id)
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/formation/modules/${module.code}` as Route} className="gla-back w-fit">
          ← {module.title}
        </Link>
        <section className="gla-clist">
          <div className="gla-csec cursor-default">
            <p className="flex items-center gap-2 text-[19px] font-bold leading-tight">
              {competence.emoji && <span aria-hidden>{competence.emoji}</span>}
              {competence.title}
              <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-[var(--gla-muted)]">
                {cases.filter((c) => bests.has(c.id)).length}/{cases.length} validés
              </span>
            </p>
            {competence.description && (
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--gla-muted)]">{competence.description}</p>
            )}
          </div>
          {cases.length === 0 ? (
            <p className="p-4 text-[13px] text-[var(--gla-muted)]">Aucun cas.</p>
          ) : (
            <ul>
              {cases.map((c, i) => (
                <CaseRow key={c.id} c={c} index={i} total={cases.length} canPlay={canPlay} best={bests.get(c.id) ?? null} />
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }

  // Module À COMPÉTENCES : on liste les compétences, pas les 22 exercices.
  const withCases = module.sections.filter((sec) => allSolos.some((c) => c.sectionId === sec.id))
  const solos = withCases.length > 0 ? allSolos.filter((c) => !c.sectionId) : allSolos
  const arenas = module.cases.filter((c) => c.kind === 'arena')
  const bosses = module.cases.filter((c) => c.kind === 'boss')
  const unlocked = bossUnlocked(avgTotal)

  if (module.cases.length === 0) {
    return <p className="py-4 text-center text-[12.5px] text-[var(--gla-muted)]">Aucun cas pour l’instant.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {withCases.length > 0 && (
        <section className="gla-clist">
          <div className="gla-clist-hd">
            <h3 className="text-sm font-bold">Compétences</h3>
          </div>
          <ul>
            {withCases.map((sec) => {
              const cases = allSolos.filter((c) => c.sectionId === sec.id)
              const done = cases.filter((c) => bests.has(c.id)).length
              return (
                <li key={sec.id}>
                  <Link
                    href={`/formation/modules/${module.code}?competence=${sec.id}` as Route}
                    className="gla-lrow"
                  >
                    {sec.emoji && <span aria-hidden className="text-lg">{sec.emoji}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold">{sec.title}</span>
                      <span className="mt-0.5 block text-[12.5px] text-[var(--gla-faint)]">
                        {cases.length} niveaux
                        {sec.description ? ` · ${sec.description}` : ''}
                      </span>
                    </span>
                    <span className="flex-none text-[12px] font-bold tabular-nums text-[var(--gla-muted)]">
                      {done}/{cases.length}
                    </span>
                    <span aria-hidden className="flex-none text-[17px] text-[var(--gla-faint)]">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {solos.length > 0 && (
        <section className="gla-clist">
          <div className="gla-clist-hd flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold">{withCases.length > 0 ? 'Autres exercices' : 'Exercices'}</h3>
            <span className="ml-auto text-[11.5px] tabular-nums text-[var(--gla-muted)]">
              {solos.filter((c) => bests.has(c.id)).length}/{solos.length} validés
            </span>
          </div>
          <ul>
            {solos.map((c, i) => (
              <CaseRow key={c.id} c={c} index={i} total={solos.length} canPlay={canPlay} best={bests.get(c.id) ?? null} />
            ))}
          </ul>
        </section>
      )}

      {arenas.length > 0 && (
        <section className="gla-clist">
          <div className="gla-clist-hd">
            <h3 className="text-sm font-bold">Test final</h3>
          </div>
          <ul>
            {arenas.map((c) => (
              <li key={c.id} className="gla-lrow">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold">{c.title}</span>
                  <span className="mt-0.5 block text-xs text-[var(--gla-faint)]">
                    {c.maxTurns} échanges max{c.reactionMaxS ? ` · ${c.reactionMaxS} s pour répondre` : ''}
                  </span>
                </span>
                <Medal best={bests.get(c.id) ?? null} />
                {canPlay && <PlayButton caseId={c.id} label={bests.has(c.id) ? 'Rejouer' : 'Jouer'} className="gla-btn border-0" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {bosses.map((c) => {
        const best = bests.get(c.id) ?? null
        return (
          <section key={c.id} className="gla-clist">
            <div className="gla-clist-hd">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden>🏆</span> {c.title}
              </h3>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <p className="text-[12.5px] leading-relaxed text-[var(--gla-muted)]">
                {c.bossFans.length} fans en parallèle · {c.maxTurns} messages max par fan
                {c.reactionMaxS ? ` · ${c.reactionMaxS} s pour répondre` : ''}
              </p>
              {/* Le verrou « 60/100 de moyenne » est appliqué par `startSession` (toast métier) ;
                  ici on le rend LISIBLE avant le clic — bouton désactivé + moyenne actuelle. */}
              {canPlay && (
                <div className="flex flex-col gap-1">
                  <PlayButton
                    caseId={c.id}
                    label={best ? 'Réaffronter le boss' : 'Affronter le boss'}
                    className="w-fit gla-btn border-0"
                    disabled={!unlocked}
                  />
                  {!unlocked && (
                    <p className="text-[11.5px] text-[var(--gla-muted)]">
                      Se débloque à {BOSS_UNLOCK_AVG}/100 de moyenne (actuelle :{' '}
                      {avgTotal == null ? '—' : Math.round(avgTotal)}).
                    </p>
                  )}
                </div>
              )}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {c.bossFans.map((f) => (
                  <li key={f.id} className="rounded-[10px] border border-[var(--gla-border)] bg-[var(--gla-surface2)] p-3 text-[12.5px]">
                    <span className="font-semibold">{f.name}</span>
                    {f.age != null && <span className="text-[var(--gla-muted)]"> · {f.age} ans</span>}
                    {f.job && <span className="block text-[var(--gla-muted)]">{f.job}</span>}
                    {f.city && <span className="block text-[var(--gla-faint)]">{f.city}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** La médaille d'un cas, façon GLA : la note colorée par palier, pas un badge à libellé. */
function Medal({ best }: { best: MyBest | null }) {
  if (!best) return <span className="text-[11px] text-[var(--gla-faint)]">—</span>
  const medal = medalFor(best.bestTotal)
  const color = best.bestTotal >= 75 ? 'text-[var(--gla-teal)]' : best.bestTotal >= 60 ? 'text-[var(--gla-warning)]' : 'text-[var(--gla-danger)]'
  return (
    <span className="flex flex-none items-center gap-1" title={`Meilleure note : ${best.bestTotal}/100`}>
      {medal && <span aria-hidden>{MEDAL_EMOJI[medal]}</span>}
      <b className={`text-[13.5px] tabular-nums ${color}`}>{best.bestTotal}</b>
      <span className="text-[11px] text-[var(--gla-faint)]">/100</span>
    </span>
  )
}

function CaseRow({
  c,
  index,
  total,
  canPlay,
  best,
}: {
  c: PublicCase
  index: number
  total: number
  canPlay: boolean
  best: MyBest | null
}) {
  return (
    <li className="gla-lrow">
      <DifficultyBars difficulty={c.difficulty} index={index} total={total} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">{c.title}</span>
        <span className="mt-0.5 block text-xs text-[var(--gla-faint)]">
          {c.phase ? `${c.phase} · ` : ''}
          {c.maxTurns} échanges max
        </span>
      </span>
      <Medal best={best} />
      {canPlay && <PlayButton caseId={c.id} label={best ? 'Rejouer' : 'Jouer'} className="gla-btn border-0" />}
    </li>
  )
}
