'use client'

import * as React from 'react'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon, Loader2 } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Sélecteur de période partagé (header du (dash), présent sur toutes les pages).
 * État = URL search params `?from=YYYY-MM-DD&to=YYYY-MM-DD` : persistant, partageable,
 * lisible côté serveur (les pages RSC `await searchParams` -> re-query Supabase).
 * Défaut (URL vide) = mois en cours.
 *
 * Perf / normes :
 *  - on ne pousse l'URL (= on ne re-render le serveur) QUE lorsque la plage est
 *    complète (from + to) -> un seul refetch par sélection, pas deux ;
 *  - navigation enveloppée dans `useTransition` -> `isPending` alimente l'indicateur
 *    de chargement et l'ancienne UI reste affichée pendant le refetch (stale-while-
 *    revalidate, pas de flash) ;
 *  - `router.replace` (pas `push`) -> aucune entrée d'historique parasite.
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
  const [isPending, startTransition] = React.useTransition()

  const now = React.useMemo(() => new Date(), [])

  // Plage appliquée (depuis l'URL) : sert de label + de base au calendrier.
  // Type inféré `{ from: Date; to: Date | undefined }` -> `from` toujours défini.
  const applied = React.useMemo(() => {
    const from = parseDate(searchParams.get('from'))
    const to = parseDate(searchParams.get('to'))
    // Défaut = du 1er du mois à AUJOURD'HUI (pas la fin du mois).
    return from ? { from, to } : { from: startOfMonth(now), to: now }
  }, [searchParams, now])

  // Sélection en cours dans le calendrier, découplée de l'URL : permet d'afficher le
  // 1er clic sans déclencher de navigation.
  const [draft, setDraft] = React.useState<DateRange | undefined>(applied)

  function commit(range: DateRange) {
    if (!range.from) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', toParam(range.from))
    params.set('to', toParam(range.to ?? range.from))
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
    setOpen(false)
  }

  function handleSelect(next: DateRange | undefined) {
    setDraft(next)
    // Navigation (donc refetch) UNIQUEMENT quand la plage est complète.
    if (next?.from && next?.to) commit(next)
  }

  const label = applied.to
    ? `${format(applied.from, 'd MMM', { locale: fr })} – ${format(applied.to, 'd MMM yyyy', { locale: fr })}`
    : format(applied.from, 'd MMM yyyy', { locale: fr })

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(applied) // ré-aligne le calendrier sur la plage appliquée
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-busy={isPending}
          className={cn('gap-2 font-normal', className)}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarIcon className="h-4 w-4" />
          )}
          <span className="tabular-nums">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          defaultMonth={applied.from}
          selected={draft}
          onSelect={handleSelect}
          numberOfMonths={2}
          disabled={{ after: now }}
          endMonth={endOfMonth(now)}
          locale={fr}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
