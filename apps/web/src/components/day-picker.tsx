'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { addDays, frWeekdayLong, todayParis } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { parseDay } from '@/lib/period'
import { DAY_WINDOW } from '@/lib/periods'

/** Datepicker mono-date PARTAGÉ des champs `day` de saisie (valeur RHF en `YYYY-MM-DD`) —
 *  Tracker sanctions ET Rapport du soir. Même fenêtre de 14 jours que la borne serveur
 *  (`isDayInWindow`) : le calendrier désactive tout le reste (en édition, une date d'ORIGINE
 *  plus ancienne reste affichée et soumise telle quelle — seule une re-datation est bornée).
 *  Parseur partagé `parseDay` (lib/period.ts) — garde Invalid Date comprise.
 *  `modal` : dans un Dialog Radix, un Popover non modal perd le focus et se ferme mal. */
export function DayPicker({ field }: { field: { value: string; onChange: (value: string) => void } }) {
  const [open, setOpen] = useState(false)
  const today = todayParis()
  const selected = parseDay(field.value) ?? undefined
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 justify-start gap-2 text-sm font-normal"
        >
          <CalendarIcon className="size-4" />
          {frWeekdayLong(field.value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return
            field.onChange(format(d, 'yyyy-MM-dd'))
            setOpen(false)
          }}
          defaultMonth={selected}
          disabled={{
            // `todayParis()` et son décalé sont toujours parsables → le `?? new Date()` ne sert
            // qu'à satisfaire le type sans assertion.
            before: parseDay(addDays(today, -(DAY_WINDOW - 1))) ?? new Date(),
            after: parseDay(today) ?? new Date(),
          }}
          locale={fr}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
