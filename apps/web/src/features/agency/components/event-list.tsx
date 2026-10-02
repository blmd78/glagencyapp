import { CollapsibleSection } from '@/components/collapsible-section'
import { UrlTabs } from '@/components/url-tabs'
import { splitEvents, untilLabel, type ListTab } from '../event-list'
import type { AgencyEvent } from '../month-layout'
import type { Legend } from '../schema'
import { EventCard } from './event-card'
import type { AgencyModel } from '../services/get-agency-events'

const countLabel = (n: number) => (n === 0 ? 'aucun événement' : n === 1 ? '1 événement' : `${n} événements`)

type CardsProps = {
  events: AgencyEvent[]
  empty: string
  status: (event: AgencyEvent) => string
  legend: Legend
  models: AgencyModel[]
  canEdit: boolean
}

/** Une à trois cartes par ligne selon l'écran, toutes au même format vertical. */
function Cards({ events, empty, status, legend, models, canEdit }: CardsProps) {
  if (events.length === 0) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => (
        <li key={event.id} className="min-w-0">
          <EventCard event={event} status={status(event)} legend={legend} models={models} canEdit={canEdit} />
        </li>
      ))}
    </ul>
  )
}

function Section({ title, ...props }: CardsProps & { title: string }) {
  return (
    <CollapsibleSection
      defaultOpen
      density="confortable"
      contentClassName="p-3 sm:p-4"
      trigger={
        <>
          {title}
          <span className="text-sm font-normal text-muted-foreground">({countLabel(props.events.length)})</span>
        </>
      }
    >
      <Cards {...props} />
    </CollapsibleSection>
  )
}

/** Photos et dates sous le calendrier ; onglets d'URL et sections repliables conservés. */
export function EventList({ events, today, tab, legend, models, canEdit }: { events: AgencyEvent[]; today: string; tab: ListTab; legend: Legend; models: AgencyModel[]; canEdit: boolean }) {
  const { today: now, upcoming, past } = splitEvents(events, today)
  const shared = { legend, models, canEdit }
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
              <Section title="Aujourd’hui" events={now} empty="Rien aujourd’hui." status={() => 'En cours'} {...shared} />
              <Section title="Prochainement" events={upcoming} empty="Rien de prévu." status={(event) => untilLabel(event.startDate, today)} {...shared} />
            </div>
          ),
        },
        {
          value: 'passe',
          label: `Passé (${past.length})`,
          content: <Cards events={past} empty="Aucun événement passé." status={() => 'Terminé'} {...shared} />,
        },
      ]}
    />
  )
}
