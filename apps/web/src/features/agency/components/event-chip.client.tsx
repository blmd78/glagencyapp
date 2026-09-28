'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatEventDates, type EventBar } from '../month-layout'
import { EventDialog } from './event-dialog.client'

export function EventChip({ bar, canEdit }: { bar: EventBar; canEdit: boolean }) {
  const { event } = bar
  const chip = (
    <button
      type="button"
      title={event.title}
      className={cn(
        'w-full truncate rounded-sm bg-primary/10 px-1.5 text-left text-xs leading-5 hover:bg-primary/15',
        bar.continuesBefore && 'rounded-l-none',
        bar.continuesAfter && 'rounded-r-none',
      )}
    >
      {event.title}
    </button>
  )
  if (canEdit) return <EventDialog event={event} trigger={chip} />
  return (
    <Popover>
      <PopoverTrigger asChild>{chip}</PopoverTrigger>
      <PopoverContent className="w-64 text-sm" align="start">
        <p className="font-medium">{event.title}</p>
        <p className="text-muted-foreground">{formatEventDates(event.startDate, event.endDate)}</p>
      </PopoverContent>
    </Popover>
  )
}
