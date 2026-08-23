import { BOSS_UNLOCK_AVG, bossUnlocked } from '@glagency/core'
import { DifficultyBars } from '@/components/training/difficulty-bars'
import { ScoreBadge } from '@/components/training/score-badge'
import { PlayButton } from '@/components/training/play-button'
import { Badge } from '@/components/ui/badge'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import type { MyBest } from '../services/get-my-bests'
import type { ModuleDetail, PublicCase } from '../types'

/**
 * Cas du module « à faire », avec le meilleur résultat du visiteur (médaille + nombre d'essais).
 * Groupés par section (dans l'ordre du module), puis par position ; les cas sans section sous
 * « Autres cas » s'il y a des sections, à plat sinon ; le défi simultané en dernier, à part ; un
 * module Boss = son cas boss avec ses fans côté visible.
 * `canPlay` = droit Entraînement : un encadrant Suivi seul voit les cas SANS bouton « Jouer »
 * (et sans médaille : `bests` est vide pour lui).
 */
export function CasesList({
  module,
  canPlay,
  bests,
  avgTotal,
}: {
  module: ModuleDetail
  canPlay: boolean
  bests: Map<string, MyBest>
  avgTotal: number | null
}) {
  const solos = module.cases.filter((c) => c.kind === 'solo')
  const arenas = module.cases.filter((c) => c.kind === 'arena')
  const bosses = module.cases.filter((c) => c.kind === 'boss')
  const unlocked = bossUnlocked(avgTotal)
  const groups: { key: string; title: string | null; description: string | null; cases: PublicCase[] }[] = []
  if (module.sections.length) {
    for (const s of module.sections) {
      const cases = solos.filter((c) => c.sectionId === s.id)
      if (cases.length) groups.push({ key: s.id, title: `${s.emoji ? `${s.emoji} ` : ''}${s.title}`, description: s.description, cases })
    }
    const rest = solos.filter((c) => !module.sections.some((s) => s.id === c.sectionId))
    if (rest.length) groups.push({ key: 'rest', title: 'Autres cas', description: null, cases: rest })
  } else if (solos.length) {
    groups.push({ key: 'all', title: null, description: null, cases: solos })
  }

  if (module.cases.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun cas pour l’instant.</p>
  }
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-3">
          {g.title && (
            <div>
              <h3 className="text-base font-semibold">{g.title}</h3>
              {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {g.cases.map((c) => <CaseRow key={c.id} c={c} canPlay={canPlay} best={bests.get(c.id) ?? null} />)}
          </ul>
        </section>
      ))}
      {arenas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Défi simultané</h3>
          <ul className="flex flex-col gap-2">
            {arenas.map((c) => <CaseRow key={c.id} c={c} canPlay={canPlay} best={bests.get(c.id) ?? null} />)}
          </ul>
        </section>
      )}
      {bosses.map((c) => {
        const best = bests.get(c.id) ?? null
        return (
          <section key={c.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold">{c.title}</h3>
              <ScoreBadge total={best?.bestTotal ?? null} />
            </div>
            <p className="text-sm text-muted-foreground">
              {c.bossFans.length} fans en parallèle · {c.maxTurns} messages max par fan{c.reactionMaxS ? ` · ${c.reactionMaxS} s pour répondre` : ''}
            </p>
            {/* Le verrou « 60/100 de moyenne » est appliqué par `startSession` (toast métier) ; ici on
                le rend LISIBLE avant le clic — bouton désactivé + moyenne actuelle. */}
            {canPlay && (
              <div className="flex flex-col gap-1">
                <PlayButton
                  caseId={c.id}
                  label={best ? 'Réaffronter le boss' : 'Affronter le boss'}
                  className="w-fit"
                  disabled={!unlocked}
                />
                {!unlocked && (
                  <p className="text-xs text-muted-foreground">
                    Se débloque à {BOSS_UNLOCK_AVG}/100 de moyenne (actuelle : {avgTotal == null ? '—' : Math.round(avgTotal)}).
                  </p>
                )}
              </div>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {c.bossFans.map((f) => (
                <li key={f.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {f.color && <span aria-hidden className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: f.color }} />}
                    {f.name}
                    {f.age ? `, ${f.age} ans` : ''}
                  </p>
                  <p className="text-muted-foreground">{[f.job, f.city].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1">{f.persona}</p>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function CaseRow({ c, canPlay, best }: { c: PublicCase; canPlay: boolean; best: MyBest | null }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
      <span className="font-medium">{c.title}</span>
      {c.phase && <span className="text-muted-foreground">{c.phase}</span>}
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {canPlay && <PlayButton caseId={c.id} label={best ? 'Rejouer' : 'Jouer'} />}
        <ScoreBadge total={best?.bestTotal ?? null} />
        {best && best.attempts > 1 && <span className="tabular-nums">× {best.attempts}</span>}
        {c.kind !== 'solo' && <Badge variant="secondary">{CASE_KIND_LABELS[c.kind]}</Badge>}
        {c.isSale && <Badge variant="outline">vente</Badge>}
        <DifficultyBars difficulty={c.difficulty} />
        <span className="tabular-nums">{c.maxTurns} msg{c.kind === 'boss' ? '/fan' : ''}</span>
        {c.reactionMaxS && <span className="tabular-nums">{c.reactionMaxS} s</span>}
      </span>
    </li>
  )
}
