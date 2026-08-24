import { BOSS_UNLOCK_AVG } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { ScoreBadge } from '@/components/training/score-badge'
import type { MeData, MeModule } from '../types'

/**
 * « Tes modules » — transposition du panneau GLA (`paintModules` / `.apanel` + `.amcard`) : une
 * carte par module, tuile emoji à gauche, pourcentage en vert à droite, barre dégradée dessous.
 *
 * Le boss final se lit à part : il ne compte pas dans la progression des modules (verrouillé sous
 * 60/100 de moyenne, sinon son meilleur essai).
 */
export function MeModules({ data }: { data: MeData }) {
  const { modules, stats, bossUnlocked: unlocked, totalCases } = data
  return (
    <section className="gla-panel">
      <h2 className="mb-[14px] flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden>⚔️</span> Tes modules
        <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-[var(--gla-muted)]">
          {stats.casesDone}/{totalCases} cas validés
        </span>
      </h2>

      {modules.length === 0 ? (
        <p className="py-[14px] text-center text-[12.5px] text-[var(--gla-muted)]">
          Aucun module ne t’a encore été attribué.
        </p>
      ) : (
        <ul className="flex flex-col gap-[9px]">
          {modules.map((m) => <ModuleCard key={m.id} m={m} />)}
        </ul>
      )}

      <div className="mt-[9px] flex flex-col gap-2 rounded-[14px] border border-[var(--gla-border)] bg-[var(--gla-surface2)] p-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold">
            <span aria-hidden className="mr-1.5">🏆</span> Boss final
          </h3>
          {unlocked && <ScoreBadge total={stats.bossBest} />}
          {!unlocked && <span className="text-xs text-[var(--gla-muted)]">🔒 verrouillé</span>}
        </div>
        <p className="text-[11.5px] leading-relaxed text-[var(--gla-muted)]">
          {unlocked
            ? stats.bossDone
              ? 'Réussi — tu peux le refaire pour améliorer ta note.'
              : 'Débloqué : 5 conversations en même temps, une seule tentative à la fois.'
            : `Se débloque à ${BOSS_UNLOCK_AVG}/100 de moyenne (actuelle : ${stats.avgTotal == null ? '—' : Math.round(stats.avgTotal)}).`}
        </p>
        {/* Le boss se joue depuis SON module (avec ses 5 fans) : sans ce lien, un chatteur débloqué
            n'a aucun chemin vers lui depuis Ma formation. */}
        <Link href="/formation/modules" className="w-fit text-[12px] font-bold text-[var(--gla-accent)] hover:underline">
          Voir les modules →
        </Link>
      </div>
    </section>
  )
}

function ModuleCard({ m }: { m: MeModule }) {
  const { progress } = m
  const complete = progress.total > 0 && progress.done === progress.total
  // Toute la carte est le lien (affordance GLA : elle glisse vers la droite au survol).
  return (
    <li>
      <Link href={`/formation/modules/${m.code}?vue=cas` as Route} className="gla-card flex items-center gap-[13px] p-3">
        <span className="gla-tile grid size-11 flex-none place-items-center rounded-[13px] text-[21px]" aria-hidden>
          {m.emoji ?? '🎯'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {m.title}
            {complete && <span aria-hidden className="ml-1.5">✅</span>}
          </span>
          <span className="mt-px block text-[11.5px] tabular-nums text-[var(--gla-muted)]">
            {progress.done}/{progress.total} cas · moy. {progress.avg ?? '—'} · {progress.points} pts
          </span>
          <span className="gla-bar mt-1.5 block h-[5px]">
            <i style={{ width: `${Math.min(100, progress.pct)}%` }} />
          </span>
        </span>
        <span
          className={`flex-none text-right text-[15px] font-extrabold tabular-nums ${
            progress.done > 0 ? 'text-[var(--gla-accent)]' : 'text-[var(--gla-muted)]'
          }`}
        >
          {progress.pct}%
        </span>
      </Link>
    </li>
  )
}
