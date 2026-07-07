'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlanningGrid } from './components/planning-grid'
import type { ReposData } from './types'

/** Template Planning repos : sélecteur de semaine + grille éditable. Aucun fetch. */
export function ReposTemplate({ data, isAdmin }: { data: ReposData; isAdmin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const selectWeek = (start: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('week', start)
    startTransition(() => router.push(`?${next.toString()}`))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning des repos</h1>
          <p className="text-sm text-muted-foreground">
            Jours de repos des chatteurs par équipe · {data.weekLabel}
          </p>
        </div>
        <div className="ml-auto">
          <Select value={data.weekStart} onValueChange={selectWeek} disabled={pending}>
            <SelectTrigger className="h-9 w-64 text-sm tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.weeks.map((w) => (
                <SelectItem key={w.start} value={w.start} className="text-sm tabular-nums">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>
        <PlanningGrid key={data.weekStart} data={data} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
