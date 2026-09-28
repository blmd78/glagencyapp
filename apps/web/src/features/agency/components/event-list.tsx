import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'
import { CollapsibleSection } from '@/components/collapsible-section'
import { UrlTabs } from '@/components/url-tabs'
import { splitEvents, untilLabel, type ListTab } from '../event-list'
import { formatEventDates, type AgencyEvent } from '../month-layout'
import type { Legend } from '../schema'
import { EventDialog } from './event-dialog.client'
import { EventView } from './event-view'
import { ColorDot } from './legend'

const countLabel = (n: number) => (n === 0 ? 'aucun événement' : n === 1 ? '1 événement' : `${n} événements`)

/**
 * Une ligne : la couleur, le titre (et une icône s'il a une photo), puis l'échéance et les dates.
 * Clic : l'édition chez l'admin, la fiche en lecture chez les autres — comme sur la grille.
 */
function EventRow({ event, until, legend, canEdit }: { event: AgencyEvent; until?: string; legend: Legend; canEdit: boolean }) {
  const content = (
    <>
      <ColorDot color={event.color} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
      {event.imageUrl && <ImageIcon aria-label="Avec photo" className="size-3.5 shrink-0 text-muted-foreground" />}
      {until && <span className="shrink-0 text-xs text-muted-foreground">{until}</span>}
      <span className="shrink-0 text-sm text-muted-foreground">{formatEventDates(event.startDate, event.endDate)}</span>
    </>
  )
  const trigger = (
    <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
      {content}
    </button>
  )
  if (canEdit) return <EventDialog event={event} legend={legend} trigger={trigger} />
  return <EventView event={event} legend={legend} trigger={trigger} />
}

/** Les lignes d'un panneau, `divide-y` entre elles comme dans la To-Do, ou son état vide. */
function Rows({ children, empty }: { children: ReactNode[]; empty: string }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {children.length > 0 ? children : <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p>}
    </div>
  )
}

function Section({ title, events, empty, children }: { title: string; events: AgencyEvent[]; empty: string; children: (e: AgencyEvent) => ReactNode }) {
  return (
    <CollapsibleSection
      defaultOpen
      trigger={
        <>
          {title}
          <span className="font-normal text-muted-foreground">({countLabel(events.length)})</span>
        </>
      }
    >
      <Rows empty={empty}>{events.map(children)}</Rows>
    </CollapsibleSection>
  )
}

/**
 * La liste sous le calendrier : « À venir » (Aujourd'hui + Prochainement) et « Passé » (tout),
 * en onglets d'URL (`?vue=`). Sections repliables et lignes reprises de la To-Do
 * (`CollapsibleSection`, `divide-y`) — le précédent de la DA pour une liste par statut.
 */
export function EventList({ events, today, tab, legend, canEdit }: { events: AgencyEvent[]; today: string; tab: ListTab; legend: Legend; canEdit: boolean }) {
  const { today: now, upcoming, past } = splitEvents(events, today)
  return (
    <UrlTabs
      value={tab}
      defaultValue="a-venir"
      items={[
        {
          value: 'a-venir',
          label: `À venir (${now.length + upcoming.length})`,
          content: (
            <div className="flex flex-col gap-4">
              <Section title="Aujourd’hui" events={now} empty="Rien aujourd’hui.">
                {(e) => <EventRow key={e.id} event={e} legend={legend} canEdit={canEdit} />}
              </Section>
              <Section title="Prochainement" events={upcoming} empty="Rien de prévu.">
                {(e) => <EventRow key={e.id} event={e} until={untilLabel(e.startDate, today)} legend={legend} canEdit={canEdit} />}
              </Section>
            </div>
          ),
        },
        {
          value: 'passe',
          label: `Passé (${past.length})`,
          content: (
            // Un seul panneau, sans titre : l'onglet en tient lieu — même cadre que les sections.
            <div className="overflow-hidden rounded-md border bg-card">
              <Rows empty="Aucun événement passé.">
                {past.map((e) => <EventRow key={e.id} event={e} legend={legend} canEdit={canEdit} />)}
              </Rows>
            </div>
          ),
        },
      ]}
    />
  )
}
