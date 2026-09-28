import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { frMonthLong } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { MonthGrid } from './components/month-grid'
import { EventDialog } from './components/event-dialog.client'
import { EventList } from './components/event-list'
import type { ListTab } from './event-list'
import { layoutMonth, shiftMonth, type AgencyEvent } from './month-layout'

/**
 * Agence — le calendrier des événements de l'agence, et leur liste en dessous. Écriture admin,
 * lecture pour tous. Changer de mois garde l'onglet de la liste (`?vue=`) : les deux sont
 * indépendants.
 */
export function AgencyTemplate({ month, today, events, tab, canEdit }: { month: string; today: string; events: AgencyEvent[]; tab: ListTab; canEdit: boolean }) {
  const vue = tab === 'a-venir' ? {} : { vue: tab }
  const monthHref = (mois: string) => ({ pathname: '/chatter/agence' as const, query: { mois, ...vue } })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Agence</h1>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={monthHref(shiftMonth(month, -1))} aria-label="Mois précédent" prefetch={false}><ChevronLeft className="size-4" /></Link>
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{frMonthLong(`${month}-01`)}</span>
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={monthHref(shiftMonth(month, 1))} aria-label="Mois suivant" prefetch={false}><ChevronRight className="size-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            {/* `prefetch={false}` sur les 3 liens de navigation mois : un `Link` nu se reprefetch
                en fond ~ttes les 300 s tant que la page est ouverte — le coût Vercel corrigé en
                Release 2.56 (`docs/perf-vercel-prefetch.md`). */}
            <Link href={{ pathname: '/chatter/agence', query: vue }} prefetch={false}>Aujourd’hui</Link>
          </Button>
        </div>
        {canEdit && (
          <div className="ml-auto">
            <EventDialog />
          </div>
        )}
      </div>
      <MonthGrid month={month} today={today} weeks={layoutMonth(month, events)} canEdit={canEdit} />
      <EventList events={events} today={today} tab={tab} canEdit={canEdit} />
    </div>
  )
}
