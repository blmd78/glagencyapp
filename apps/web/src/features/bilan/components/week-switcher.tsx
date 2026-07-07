'use client'

import { useTransition, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoadingDots } from '@/components/loading-dots'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Enveloppe cliente du Bilan : porte le seul état interactif (sélecteur de semaine + dimming
 * pendant la navigation). Le `header` et les `children` (KPIs + cartes) sont des Server
 * Components rendus côté serveur et passés à travers — ils ne s'hydratent pas.
 */
export function WeekSwitcher({
  weeks,
  current,
  header,
  children,
}: {
  weeks: { start: string; label: string }[]
  current: string
  header: ReactNode
  children: ReactNode
}) {
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
        {header}
        <div className="ml-auto">
          <Select value={current} onValueChange={selectWeek} disabled={pending}>
            <SelectTrigger className="h-9 w-56 text-sm tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((w) => (
                <SelectItem key={w.start} value={w.start} className="text-sm tabular-nums">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative flex flex-col gap-6">
        {pending && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-24">
            <LoadingDots />
          </div>
        )}
        <div className={pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>
          {children}
        </div>
      </div>
    </div>
  )
}
