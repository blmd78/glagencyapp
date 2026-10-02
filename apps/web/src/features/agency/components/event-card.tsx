import type { CSSProperties } from 'react'
import Image from 'next/image'
import { ArrowUpRight, CalendarDays, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatEventDates, type AgencyEvent } from '../month-layout'
import type { Legend } from '../schema'
import { EventDialog } from './event-dialog.client'
import { EventView } from './event-view'
import { ColorDot } from './legend'

/** Carte verticale : photo au-dessus des informations, même ouverture que le calendrier. */
export function EventCard({ event, status, legend, canEdit }: {
  event: AgencyEvent
  status: string
  legend: Legend
  canEdit: boolean
}) {
  const label = event.color ? legend[event.color] : undefined
  const month = new Date(`${event.startDate}T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'short', timeZone: 'UTC',
  })
  const trigger = (
    <button
      type="button"
      style={{ '--event-color': event.color ?? 'var(--muted-foreground)' } as CSSProperties}
      className="group grid h-full w-full cursor-pointer overflow-hidden rounded-xl bg-card text-left outline-none ring-1 ring-inset ring-border transition-[box-shadow,background-color] duration-200 hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {event.imageUrl && (
        <span className="relative block aspect-[16/10] overflow-hidden bg-muted">
          {/* URL privée éphémère : pas de transformation facturée à chaque signature. */}
          <Image
            unoptimized
            loading="lazy"
            decoding="async"
            src={event.imageUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-visible:scale-[1.03] motion-reduce:transition-none"
          />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-5 bg-[color-mix(in_srgb,var(--event-color)_6%,var(--card))] p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <ColorDot color={event.color} />
            <span className="break-words">{label || 'Événement'}</span>
          </span>
          <Badge variant="secondary" className="max-w-[55%] shrink-0 whitespace-normal bg-background text-center first-letter:uppercase">
            {status}
          </Badge>
        </span>
        <span className="flex items-start gap-4">
          <span aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-background px-2 py-3">
            <span className="text-2xl font-semibold leading-none tabular-nums">{Number(event.startDate.slice(8, 10))}</span>
            <span className="mt-1 text-xs font-medium uppercase text-muted-foreground">{month}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-2">
            <span className="break-words text-lg font-semibold leading-snug tracking-tight">
              {event.title}
            </span>
            <span className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
              <CalendarDays aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
              <span className="first-letter:uppercase">{formatEventDates(event.startDate, event.endDate)}</span>
            </span>
          </span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-1 text-sm font-medium">
          {canEdit ? 'Modifier l’événement' : 'Voir l’événement'}
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background transition-colors duration-200 group-hover:bg-foreground group-hover:text-background group-focus-visible:bg-foreground group-focus-visible:text-background motion-reduce:transition-none">
            {canEdit ? <Pencil aria-hidden="true" className="size-4" /> : <ArrowUpRight aria-hidden="true" className="size-4" />}
          </span>
        </span>
      </span>
    </button>
  )
  if (canEdit) return <EventDialog event={event} legend={legend} trigger={trigger} />
  return <EventView event={event} legend={legend} trigger={trigger} />
}
