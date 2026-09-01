import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { addDays, todayParis } from '@glagency/core'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { RecapTemplate } from '@/features/tracking-recap/RecapTemplate'
import { RecapSkeleton } from '@/features/tracking-recap/components/recap-skeleton'
import { getWeekRecap, type RecapData } from '@/features/tracking-recap/services/get-week-recap'
import { weekStartOf } from '@/features/tracking-todo/services/get-week'

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
  // ENCADREMENT, chacun dans son périmètre (2026-08-31) — et non plus admin strict.
  //
  // Ce qui reste de la fermeture d'origine : le VERBATIM. Le tracker réservait cet écran aux
  // admins (`requireAdminView`, routes.js.txt:436) et l'ouvrir à tout porteur du slug `presence`
  // donnait à un sous-manager le journal intime de ses pairs — c'est ce que 0132 a refermé, et
  // `tracker_todo_daily_read` reste fermée. Ce qui change : les COMPTEURS. La RPC (definer, 0137)
  // rend à chacun son périmètre — admin → tout, manager → lui + ses sous-managers rattachés,
  // sous-manager → lui seul — et ne joint le texte des débriefs que pour un admin ou soi-même.
  //
  // La garde ne fait donc que refuser les NON-ENCADRANTS (chatteur, police) à qui on aurait coché
  // « Présence » : la RPC leur rendrait de toute façon leur seule ligne, mais un écran de suivi
  // d'équipe n'est pas à eux. `profile.manager` couvre manager ET sous-manager — exactement ce que
  // la sidebar lit pour afficher l'item (`managerAccess`, config/workspaces.ts).
  const profile = await requireAccess('presence')
  if (profile.role !== 'admin' && !profile.manager) notFound()
  const { week } = await searchParams

  const data = getWeekRecap({ id: profile.id, isAdmin: profile.role === 'admin' }, week)

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
      {/* Nav de semaine segmentée, identique au tracker et à l'écran To-Do. */}
      <div className="seg">
        <Link href={href(addDays(d.weekStart, -7))} aria-label="Semaine précédente">‹</Link>
        <Link href={href(weekStartOf(todayParis()))}>cette semaine</Link>
        <Link href={href(addDays(d.weekStart, 7))} aria-label="Semaine suivante">›</Link>
      </div>
    </CtxBar>
  )
}

async function Body({ data }: { data: Promise<RecapData> }) {
  return <RecapTemplate data={await data} />
}

const label = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`))
