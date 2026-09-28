import type { ReactNode } from 'react'
import { CollapsibleSection } from '@/components/collapsible-section'
import { UrlTabs } from '@/components/url-tabs'
import { splitEvents, untilLabel, type ListTab } from '../event-list'
import { formatEventDates, type AgencyEvent } from '../month-layout'
import { EventDialog } from './event-dialog.client'

const countLabel = (n: number) => (n === 0 ? 'aucun événement' : n === 1 ? '1 événement' : `${n} événements`)

/** Une ligne : le titre, puis l'échéance et les dates. Chez l'admin, elle ouvre l'édition — comme sur la grille. */
function EventRow({ event, until, canEdit }: { event: AgencyEvent; until?: string; canEdit: boolean }) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
      {until && <span className="shrink-0 text-xs text-muted-foreground">{until}</span>}
      <span className="shrink-0 text-sm text-muted-foreground">{formatEventDates(event.startDate, event.endDate)}</span>
    </>
  )
  const row = 'flex w-full items-center gap-3 px-3 py-2 text-left'
  if (!canEdit) return <div className={row}>{content}</div>
  return (
    <EventDialog
      event={event}
      trigger={
        <button type="button" className={`${row} hover:bg-muted/50`}>
          {content}
        </button>
      }
    />
  )
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
export function EventList({ events, today, tab, canEdit }: { events: AgencyEvent[]; today: string; tab: ListTab; canEdit: boolean }) {
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
                {(e) => <EventRow key={e.id} event={e} canEdit={canEdit} />}
              </Section>
              <Section title="Prochainement" events={upcoming} empty="Rien de prévu.">
                {(e) => <EventRow key={e.id} event={e} until={untilLabel(e.startDate, today)} canEdit={canEdit} />}
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
                {past.map((e) => <EventRow key={e.id} event={e} canEdit={canEdit} />)}
              </Rows>
            </div>
          ),
        },
      ]}
    />
  )
}
