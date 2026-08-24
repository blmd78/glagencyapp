import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ModulesData } from './services/get-modules-progress'

/**
 * Liste des modules — Server Component, aucun fetch.
 *
 * Chaque carte porte la progression du visiteur : sans elle, la page ne disait ni où il en est ni
 * où reprendre, et douze cartes identiques ne donnent envie d'en ouvrir aucune. Un module bouclé
 * passe en vert avec sa coche, un module entamé montre sa barre, un module jamais touché s'annonce
 * comme tel.
 */
export function ModulesTemplate({ data }: { data: ModulesData }) {
  const { modules, overall, showProgress } = data
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-[var(--gla-muted)]">Un module = un cours à lire, puis des cas à jouer.</p>

      {showProgress && overall.total > 0 && (
        <section className="gla-obj flex flex-wrap items-center gap-4 px-[18px] py-[14px]">
          <span aria-hidden className="text-[28px] leading-none">📚</span>
          <div className="min-w-[200px] flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.6px] text-[#c4b5fd]">Ta progression</p>
            <p className="mt-0.5 text-[14.5px] font-bold">
              {overall.done}/{overall.total} cas validés
              <span className="ml-2 text-[12px] font-semibold tabular-nums text-[var(--gla-muted)]">
                {overall.points.toLocaleString('fr-FR')} pts · moy. {overall.avg ?? '—'}
              </span>
            </p>
            <div className="gla-bar mt-2 h-[7px]">
              <i className="xp-bar" style={{ '--xp-pct': `${overall.pct}%` } as React.CSSProperties} />
            </div>
          </div>
          <span className="flex-none text-xl font-extrabold tabular-nums text-[var(--gla-accent)]">{overall.pct}%</span>
        </section>
      )}

      {modules.length === 0 ? (
        <p className="py-[14px] text-center text-[12.5px] text-[var(--gla-muted)]">
          Aucun module ne t’a encore été attribué.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const { progress: p } = m
            const complete = showProgress && p.total > 0 && p.done === p.total
            const started = showProgress && p.done > 0
            return (
              <li key={m.id}>
                <Link
                  href={`/formation/modules/${m.code}`}
                  className={cn('gla-card flex h-full flex-col gap-2 p-4', complete && 'border-[var(--gla-accent)]')}
                >
                  <span className="flex items-center gap-2.5 text-sm font-bold">
                    <span className="gla-tile grid size-11 flex-none place-items-center rounded-[13px] text-[21px]" aria-hidden>
                      {m.emoji ?? '🎯'}
                    </span>
                    {m.title}
                    {complete && <span aria-hidden className="ml-auto">✅</span>}
                  </span>
                  {m.description && (
                    <span className="text-[12px] leading-relaxed text-[var(--gla-muted)]">{m.description}</span>
                  )}

                  <div className="mt-auto flex flex-col gap-1.5 pt-3">
                    {showProgress && p.total > 0 && (
                      <>
                        <span className="gla-bar block h-[5px]">
                          <i style={{ width: `${Math.min(100, p.pct)}%` }} />
                        </span>
                        <span className="text-[11.5px] tabular-nums text-[var(--gla-muted)]">
                          {started ? (
                            <>
                              {p.done}/{p.total} cas · moy. {p.avg ?? '—'} · {p.points} pts
                            </>
                          ) : (
                            <>{p.total} cas · pas encore commencé</>
                          )}
                        </span>
                      </>
                    )}
                    {!showProgress && (
                      <span className="text-[11.5px] text-[var(--gla-muted)]">
                        {m.caseCount} cas{m.hasCourse ? ' · cours' : ''}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
