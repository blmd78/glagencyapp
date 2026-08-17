import Link from 'next/link'
import type { ModuleSummary } from './types'

/** Liste des modules actifs (cartes) — Server Component, aucun fetch. Sans état de progression. */
export function ModulesTemplate({ modules }: { modules: ModuleSummary[] }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">Un module = un cours à lire, puis des cas à jouer.</p>
      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun module disponible pour l’instant.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <li key={m.id}>
              <Link href={`/formation/modules/${m.code}`} className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-accent">
                <span className="flex items-center gap-2 text-base font-semibold">
                  {m.emoji && <span aria-hidden>{m.emoji}</span>}
                  {m.title}
                </span>
                {m.description && <span className="text-sm text-muted-foreground">{m.description}</span>}
                <span className="mt-auto pt-2 text-xs text-muted-foreground">
                  {m.caseCount} cas{m.hasCourse ? ' · cours' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
