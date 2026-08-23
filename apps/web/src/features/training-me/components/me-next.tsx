import { nextObjective } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { PlayButton } from '@/components/training/play-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { MeData } from '../types'

/**
 * « Ton prochain objectif » : UNE phrase, toujours actionnable — la cascade GLA (finir le module
 * commencé → le boss → viser l'or → le sacre) calculée en domaine pur (`nextObjective`).
 *
 * Le bouton mène au plus court chemin vers le jeu : reprendre la session ouverte s'il y en a une,
 * sinon lancer directement le prochain cas (`PlayButton`) plutôt que d'ouvrir une liste de plus.
 */
export function MeNext({ data }: { data: MeData }) {
  const { modules, stats, bossUnlocked, active, nextCaseId, goldCount } = data
  const objective = nextObjective({
    modules: modules.map((m) => ({ code: m.code, title: m.title, emoji: m.emoji, done: m.progress.done, total: m.progress.total })),
    bossDone: stats.bossDone,
    bossUnlocked,
    // `casesDone` peut compter des cas désactivés depuis, pas `goldCount` (catalogue actif) : clamp à 0.
    notGoldCount: Math.max(0, stats.casesDone - goldCount),
  })

  return (
    <Card className="border-xp/30 bg-xp-soft/40">
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <span aria-hidden className="text-3xl leading-none">{objective.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-xp">
            {active ? 'Session en cours' : objective.label}
          </p>
          <p className="mt-0.5 font-semibold">{active ? active.caseTitle : objective.text}</p>
        </div>
        <Action objective={objective} active={active} nextCaseId={nextCaseId} />
      </CardContent>
    </Card>
  )
}

function Action({
  objective,
  active,
  nextCaseId,
}: {
  objective: ReturnType<typeof nextObjective>
  active: MeData['active']
  nextCaseId: string | null
}) {
  // `as Route` : typedRoutes n'accepte pas une chaîne interpolée sur un segment dynamique.
  if (active) {
    return (
      <Button asChild>
        <Link href={`/formation/session/${active.id}` as Route}>Reprendre →</Link>
      </Button>
    )
  }
  if (!objective.cta) return null
  if (objective.kind === 'module' && nextCaseId) return <PlayButton caseId={nextCaseId} label={`${objective.cta} →`} size="default" />
  return (
    <Button asChild>
      <Link href={objective.moduleCode ? (`/formation/modules/${objective.moduleCode}?vue=cas` as Route) : '/formation/modules'}>
        {objective.cta} →
      </Link>
    </Button>
  )
}
