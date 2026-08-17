'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { moveModule } from '../actions'
import type { CatalogModule } from '../types'

/**
 * Colonne des modules : lien `?module=<code>` (état partageable, guidelines §6), ordre ↑↓,
 * badge inactif, compteur de cas. `onCreate` ouvre le dialog « Nouveau module » (Task 8).
 */
export function ModulesList({
  modules,
  selectedId,
  onCreate,
}: {
  modules: CatalogModule[]
  selectedId: string | null
  onCreate?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const move = (id: string, direction: 'up' | 'down') =>
    startTransition(async () => {
      const res = await moveModule({ id, direction })
      if (!res.success) toast.error(res.error)
    })

  return (
    <nav aria-label="Modules" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {modules.map((m, i) => (
          <li
            key={m.id}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm',
              m.id === selectedId && 'border-primary/50 bg-primary/5',
            )}
          >
            <Link
              href={{ pathname: '/formation/catalogue', query: { module: m.code } }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span aria-hidden className="w-5 shrink-0 text-center">{m.emoji ?? '·'}</span>
              <span className={cn('truncate', !m.active && 'text-muted-foreground line-through')}>{m.title}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{m.cases.length}</span>
              {!m.active && <Badge variant="outline">inactif</Badge>}
            </Link>
            <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`Monter ${m.title}`}
              disabled={pending || i === 0} onClick={() => move(m.id, 'up')}>
              <ArrowUp className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`Descendre ${m.title}`}
              disabled={pending || i === modules.length - 1} onClick={() => move(m.id, 'down')}>
              <ArrowDown className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      {onCreate && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onCreate}>
          <Plus className="size-4" /> Nouveau module
        </Button>
      )}
    </nav>
  )
}
