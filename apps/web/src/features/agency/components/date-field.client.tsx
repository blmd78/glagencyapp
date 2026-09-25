'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { parseDay } from '@/lib/period'
import { formatEventDates } from '../month-layout'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Choix d'un jour ou d'une période, en `AAAA-MM-JJ`. Pas le `DayPicker` partagé : il borne la saisie
 * aux 14 derniers jours (sanctions), alors qu'un événement se pose des semaines à l'avance.
 * `modal` : dans un Dialog Radix, un Popover non modal perd le focus.
 */
export function DateField({
  mode,
  start,
  end,
  onChange,
}: {
  mode: 'jour' | 'periode'
  start: string
  end: string
  onChange: (start: string, end: string) => void
}) {
  const [open, setOpen] = useState(false)
  const from = parseDay(start) ?? undefined
  const to = parseDay(end) ?? undefined
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 justify-start gap-2 text-sm font-normal">
          <CalendarIcon className="size-4" />
          {formatEventDates(start, mode === 'jour' ? start : end)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {mode === 'jour' ? (
          <Calendar
            mode="single"
            selected={from}
            defaultMonth={from}
            locale={fr}
            onSelect={(d) => {
              if (!d) return
              onChange(iso(d), iso(d))
              setOpen(false)
            }}
            autoFocus
          />
        ) : (
          <Calendar
            mode="range"
            selected={{ from, to }}
            defaultMonth={from}
            numberOfMonths={2}
            locale={fr}
            onSelect={(r) => {
              if (!r?.from) return
              onChange(iso(r.from), iso(r.to ?? r.from))
              if (r.to && r.to > r.from) setOpen(false)
            }}
            autoFocus
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
