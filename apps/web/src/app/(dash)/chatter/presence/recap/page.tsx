import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { addDays } from '@glagency/core'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { RecapTemplate } from '@/features/tracking-recap/RecapTemplate'
import { RecapSkeleton } from '@/features/tracking-recap/components/recap-skeleton'
import { getWeekRecap, type RecapData } from '@/features/tracking-recap/services/get-week-recap'

/**
 * Récap hebdomadaire — port de `/recap` du tracker GLA.
 *
 * Ce n'est PAS un récap de présence : c'est le bilan des to-do et des débriefs des encadrants.
 * Il dépend entièrement de l'écran To-Do.
 */
export default async function PresenceRecapPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  await requireAccess('presence')
  const { week } = await searchParams

  const data = getWeekRecap(week)

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="Récap" />}>
        <Header data={data} />
      </Suspense>
      <Suspense fallback={<RecapSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Header({ data }: { data: Promise<RecapData> }) {
  const d = await data
  const href = (w: string): Route => `/chatter/presence/recap?week=${w}` as Route
  return (
    <CtxBar title="Récap" crumb={<b>semaine du {label(d.weekStart)}</b>}>
      <Link className="btn sm btn-ghost" href={href(addDays(d.weekStart, -7))}>
        ← Semaine précédente
      </Link>
      <Link className="btn sm btn-ghost" href={href(addDays(d.weekStart, 7))}>
        Semaine suivante →
      </Link>
    </CtxBar>
  )
}

async function Body({ data }: { data: Promise<RecapData> }) {
  return <RecapTemplate data={await data} />
}

const label = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`))
