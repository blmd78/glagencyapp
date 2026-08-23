import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
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
      <p className="-mt-4 text-sm text-muted-foreground">Un module = un cours à lire, puis des cas à jouer.</p>

      {showProgress && overall.total > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                Ta progression — {overall.done}/{overall.total} cas validés
              </p>
              <p className="text-sm tabular-nums text-muted-foreground">
                {overall.points.toLocaleString('fr-FR')} pts · moy. {overall.avg ?? '—'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Progress
                value={overall.pct}
                animated
                className="h-2.5 flex-1"
                indicatorClassName={overall.done === overall.total ? 'bg-green-600' : 'bg-xp'}
                label="Progression sur tout le catalogue"
              />
              <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{overall.pct}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun module disponible pour l’instant.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const { progress: p } = m
            const complete = showProgress && p.total > 0 && p.done === p.total
            const started = showProgress && p.done > 0
            return (
              <li key={m.id}>
                <Link
                  href={`/formation/modules/${m.code}`}
                  className={cn(
                    'flex h-full flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent',
                    complete && 'border-green-600/40',
                  )}
                >
                  <span className="flex items-center gap-2 text-base font-semibold">
                    {m.emoji && <span aria-hidden>{m.emoji}</span>}
                    {m.title}
                    {complete && <span aria-hidden className="ml-auto">✅</span>}
                  </span>
                  {m.description && <span className="text-sm text-muted-foreground">{m.description}</span>}

                  <div className="mt-auto flex flex-col gap-1.5 pt-3">
                    {showProgress && p.total > 0 && (
                      <>
                        <Progress
                          value={p.pct}
                          className="h-1.5"
                          indicatorClassName={complete ? 'bg-green-600' : 'bg-xp'}
                          label={`${m.title} : ${p.pct}% des cas validés`}
                        />
                        <span className="text-xs tabular-nums text-muted-foreground">
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
                      <span className="text-xs text-muted-foreground">
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
