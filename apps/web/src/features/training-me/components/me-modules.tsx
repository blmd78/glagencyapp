import { BOSS_UNLOCK_AVG } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { MedalBadge } from '@/components/training/medal-badge'
import type { MeData, MeModule } from '../types'

/**
 * Progression module par module : barre d'avancement, cas faits / moyenne / points, puis chaque
 * cas en pastille avec son meilleur résultat. Le boss final se lit à part (il ne compte pas dans
 * la progression des modules) : verrouillé sous 60/100 de moyenne, sinon son meilleur essai.
 */
export function MeModules({ data }: { data: MeData }) {
  const { modules, stats, bossUnlocked: unlocked } = data
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Modules</h2>
      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun module disponible pour l’instant.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {modules.map((m) => <ModuleCard key={m.id} m={m} />)}
        </ul>
      )}
      <div className="flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">🏆 Boss final</h3>
          <MedalBadge best={stats.bossBest} />
        </div>
        <p className="text-sm text-muted-foreground">
          {unlocked
            ? stats.bossDone
              ? 'Réussi — tu peux le refaire pour améliorer ta note.'
              : 'Débloqué : 5 conversations en même temps, une seule tentative à la fois.'
            : `Se débloque à ${BOSS_UNLOCK_AVG}/100 de moyenne (actuelle : ${stats.avgTotal == null ? '—' : Math.round(stats.avgTotal)}).`}
        </p>
      </div>
    </section>
  )
}

function ModuleCard({ m }: { m: MeModule }) {
  const { progress } = m
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/formation/modules/${m.code}?vue=cas` as Route} className="text-base font-semibold hover:underline">
          {m.emoji && <span aria-hidden className="mr-2">{m.emoji}</span>}
          {m.title}
        </Link>
        <span className="text-sm tabular-nums text-muted-foreground">
          {progress.done}/{progress.total} cas · moy. {progress.avg ?? '—'} · {progress.points} pts
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress.pct)}%` }} />
      </div>
      <ul className="flex flex-wrap gap-2">
        {m.cases.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs">
            <span>{c.title}</span>
            {c.best == null ? <span className="text-muted-foreground">—</span> : <MedalBadge best={c.best} />}
          </li>
        ))}
      </ul>
    </li>
  )
}
