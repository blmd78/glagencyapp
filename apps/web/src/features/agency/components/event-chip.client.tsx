'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { EventBar } from '../month-layout'
import type { Legend } from '../schema'
import { EventDialog } from './event-dialog.client'
import { EventView } from './event-view'
import { ModelAvatar } from './model-avatar'
import type { AgencyModel } from '../services/get-agency-events'

/**
 * Une barre de la grille. Couleur : la teinte de l'événement à 20 % (30 % au survol) sous le
 * texte, pour garder le contraste — sans couleur, le gris d'origine. Clic : l'édition chez
 * l'admin, la fiche en lecture chez les autres.
 */
export function EventChip({ bar, legend, models, canEdit }: { bar: EventBar; legend: Legend; models: AgencyModel[]; canEdit: boolean }) {
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
      <span className="flex min-w-0 items-center gap-1">
        <ModelAvatar name={event.creatorName} url={event.creatorAvatarUrl} className="size-4" />
        <span className="truncate">{event.title}</span>
      </span>
    </button>
  )
  if (canEdit) return <EventDialog event={event} legend={legend} models={models} trigger={chip} />
  return <EventView event={event} legend={legend} trigger={chip} />
}
