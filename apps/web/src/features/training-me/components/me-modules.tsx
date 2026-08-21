import { BOSS_UNLOCK_AVG } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { ChevronRight } from 'lucide-react'
import { ScoreBadge } from '@/components/training/score-badge'
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
          <ScoreBadge total={stats.bossBest} />
        </div>
        <p className="text-sm text-muted-foreground">
          {unlocked
            ? stats.bossDone
              ? 'Réussi — tu peux le refaire pour améliorer ta note.'
              : 'Débloqué : 5 conversations en même temps, une seule tentative à la fois.'
            : `Se débloque à ${BOSS_UNLOCK_AVG}/100 de moyenne (actuelle : ${stats.avgTotal == null ? '—' : Math.round(stats.avgTotal)}).`}
        </p>
        {/* Le boss se joue depuis SON module (avec ses 5 fans) : sans ce lien, un chatter débloqué
            n'a aucun chemin vers lui depuis Ma formation. */}
        <Link href="/formation/modules" className="w-fit text-sm hover:underline">
          Voir les modules
        </Link>
      </div>
    </section>
  )
}

function ModuleCard({ m }: { m: MeModule }) {
  const { progress } = m
  // Toute la carte est le lien (même affordance que la liste Modules : fond au survol + chevron) :
  // le titre seul souligné au hover ne se lisait pas comme « clique ici pour jouer ».
  return (
    <li>
      <Link
        href={`/formation/modules/${m.code}?vue=cas` as Route}
        className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-accent"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-base font-semibold">
            {m.emoji && <span aria-hidden className="mr-2">{m.emoji}</span>}
            {m.title}
          </span>
          <span className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
            {progress.done}/{progress.total} cas · moy. {progress.avg ?? '—'} · {progress.points} pts
            <ChevronRight aria-hidden className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress.pct)}%` }} />
        </div>
        <ul className="flex flex-wrap gap-2">
          {m.cases.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs">
              <span>{c.title}</span>
              {c.best == null ? <span className="text-muted-foreground">—</span> : <ScoreBadge total={c.best} />}
            </li>
          ))}
        </ul>
        <span className="text-xs text-muted-foreground group-hover:text-foreground">Ouvrir le module et jouer un cas →</span>
      </Link>
    </li>
  )
}
