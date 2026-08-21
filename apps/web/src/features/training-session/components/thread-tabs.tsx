'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SessionThread } from '../types'
import { ChronoBadge } from './chrono-badge'

/**
 * Les conversations d'un défi / boss, en onglets : à qui c'est le tour (« à toi »), qui écrit
 * (« … »), et le chrono restant. Rendu à chaque tick de l'horloge (`now`) — d'où le calcul ici
 * plutôt qu'en amont.
 */
export function ThreadTabs({
  threads,
  current,
  now,
  onSelect,
}: {
  threads: SessionThread[]
  current: string
  now: number
  onSelect: (id: string) => void
}) {
  return (
    <div role="tablist" aria-label="Conversations" className="flex flex-wrap gap-2">
      {threads.map((t) => {
        const visible = t.messages.filter((m) => Date.parse(m.visibleAt) <= now)
        const pendingFan = t.messages.some((m) => m.speaker === 'fan' && Date.parse(m.visibleAt) > now)
        const lastVisible = visible[visible.length - 1]
        const yours = t.status === 'open' && !pendingFan && lastVisible?.speaker === 'fan'
        const dueMs = t.status === 'open' && t.nextDueAt && !pendingFan ? Date.parse(t.nextDueAt) - now : null
        const remaining = dueMs != null ? Math.max(0, Math.ceil(dueMs / 1000)) : null
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current}
            onClick={() => onSelect(t.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
              t.id === current && 'bg-accent',
              t.status !== 'open' && 'text-muted-foreground',
              t.status === 'lost' && 'line-through',
            )}
          >
            <span aria-hidden className={cn('size-1.5 rounded-full', t.status === 'open' ? 'bg-foreground' : 'bg-muted-foreground')} />
            <span>{t.fanName}</span>
            {yours && <Badge variant="secondary">à toi</Badge>}
            {pendingFan && (
              <span className="animate-pulse">
                <span aria-hidden>…</span>
                <span className="sr-only">{t.fanName} écrit</span>
              </span>
            )}
            {remaining != null && <ChronoBadge seconds={remaining} />}
          </button>
        )
      })}
    </div>
  )
}
