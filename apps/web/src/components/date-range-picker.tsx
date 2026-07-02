'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Sélecteur de période partagé (header du (dash), donc présent sur toutes les pages).
 * État = URL search params `?from=YYYY-MM-DD&to=YYYY-MM-DD` : persistant à la navigation
 * et lisible côté serveur (les pages RSC feront `await searchParams` pour filtrer).
 */
function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}
const toParam = (d: Date) => format(d, 'yyyy-MM-dd')

export function DateRangePicker({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = React.useState(false)

  const from = parseDate(searchParams.get('from'))
  const to = parseDate(searchParams.get('to'))
  const range: DateRange | undefined = from ? { from, to } : undefined

  function handleSelect(next: DateRange | undefined) {
    const params = new URLSearchParams(searchParams.toString())
    if (next?.from) params.set('from', toParam(next.from))
    else params.delete('from')
    if (next?.to) params.set('to', toParam(next.to))
    else params.delete('to')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    if (next?.from && next?.to) setOpen(false)
  }

  const label = range?.from
    ? range.to
      ? `${format(range.from, 'd MMM', { locale: fr })} – ${format(range.to, 'd MMM yyyy', { locale: fr })}`
      : format(range.from, 'd MMM yyyy', { locale: fr })
    : 'Choisir une période'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2 font-normal', !range && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="tabular-nums">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={2}
          defaultMonth={range?.from ?? new Date()}
          locale={fr}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
