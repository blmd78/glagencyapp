'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { EventBar } from '../month-layout'
import type { Legend } from '../schema'
import { EventDialog } from './event-dialog.client'
import { EventView } from './event-view'

/**
 * Une barre de la grille. Couleur : la teinte de l'événement à 20 % (30 % au survol) sous le
 * texte, pour garder le contraste — sans couleur, le gris d'origine. Clic : l'édition chez
 * l'admin, la fiche en lecture chez les autres.
 */
export function EventChip({ bar, legend, canEdit }: { bar: EventBar; legend: Legend; canEdit: boolean }) {
  const { event } = bar
  const chip = (
    <button
      type="button"
      title={event.title}
      style={event.color ? ({ '--event-color': event.color } as CSSProperties) : undefined}
      className={cn(
        'w-full truncate rounded-sm px-1.5 text-left text-xs leading-5',
        event.color
          ? 'bg-[color-mix(in_srgb,var(--event-color)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--event-color)_30%,transparent)]'
          : 'bg-primary/10 hover:bg-primary/15',
        bar.continuesBefore && 'rounded-l-none',
        bar.continuesAfter && 'rounded-r-none',
      )}
    >
      {event.title}
    </button>
  )
  if (canEdit) return <EventDialog event={event} legend={legend} trigger={chip} />
  return <EventView event={event} legend={legend} trigger={chip} />
}
