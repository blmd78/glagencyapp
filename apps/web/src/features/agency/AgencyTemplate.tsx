import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { frMonthLong } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { MonthGrid } from './components/month-grid'
import { EventDialog } from './components/event-dialog.client'
import { layoutMonth, shiftMonth, type AgencyEvent } from './month-layout'

const monthHref = (mois: string) => ({ pathname: '/chatter/agence' as const, query: { mois } })

/** Agence — le calendrier des événements de l'agence. Écriture admin, lecture pour tous. */
export function AgencyTemplate({ month, today, events, canEdit }: { month: string; today: string; events: AgencyEvent[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Agence</h1>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={monthHref(shiftMonth(month, -1))} aria-label="Mois précédent"><ChevronLeft className="size-4" /></Link>
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{frMonthLong(`${month}-01`)}</span>
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={monthHref(shiftMonth(month, 1))} aria-label="Mois suivant"><ChevronRight className="size-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/chatter/agence">Aujourd’hui</Link>
          </Button>
        </div>
        {canEdit && (
          <div className="ml-auto">
            <EventDialog />
          </div>
        )}
      </div>
      <MonthGrid month={month} today={today} weeks={layoutMonth(month, events)} canEdit={canEdit} />
    </div>
  )
}
