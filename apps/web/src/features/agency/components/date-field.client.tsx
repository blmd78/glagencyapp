'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
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

  // Brouillon de la plage, décorrélé de `start`/`end` tant que le popover est ouvert. Jour et
  // « Ajouter » posent toujours start = end : sans ce brouillon, la plage passée au calendrier
  // est déjà COMPLÈTE dès l'ouverture, et react-day-picker 10 étend une plage complète depuis son
  // `from` existant (`addToRange`) — le tout premier clic en mode Période produisait directement
  // « 25 sept. → 12 oct. » et refermait le popover. Même précédent déjà résolu ainsi dans
  // `date-range-picker.tsx` (`handleSelect`) : on l'imite ici plutôt que d'introduire une autre
  // technique (`resetOnSelect`) pour un bug identique.
  const [draft, setDraft] = useState<DateRange | undefined>({ from, to })

  const handleRangeSelect = (next: DateRange | undefined, jourClique: Date) => {
    // PREMIER CLIC SUR UNE PLAGE DÉJÀ COMPLÈTE = on en commence une nouvelle : clic 1 pose le
    // début, clic 2 la fin — y compris sur le MÊME jour (période d'un jour, deux clics).
    if (draft?.from && draft?.to) {
      setDraft({ from: jourClique, to: undefined })
      return
    }
    setDraft(next)
    // Validation + fermeture UNIQUEMENT quand les deux bornes sont posées.
    if (next?.from && next?.to) {
      onChange(iso(next.from), iso(next.to))
      setOpen(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setDraft({ from, to }) // ré-aligne le brouillon sur la valeur validée
      }}
      modal
    >
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
            selected={draft}
            defaultMonth={from}
            numberOfMonths={2}
            locale={fr}
            onSelect={handleRangeSelect}
            autoFocus
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
