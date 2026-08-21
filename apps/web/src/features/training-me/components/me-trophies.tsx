import type { Trophy } from '@glagency/core'
import { cn } from '@/lib/utils'

/** Les jalons de la formation (règles GLA, `computeTrophies`) : gagnés en clair, à faire en retrait. */
export function MeTrophies({ trophies }: { trophies: Trophy[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Trophées</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {trophies.map((t) => (
          <li key={t.key} className={cn('rounded-xl border p-4', !t.earned && 'opacity-50')}>
            <p className="text-sm font-medium">{t.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
