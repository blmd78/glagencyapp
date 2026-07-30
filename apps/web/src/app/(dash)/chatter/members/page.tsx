import { Suspense } from 'react'
import { requireAdminOrManager } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { getMembers } from '@/features/members/services/get-members'
import { getTurnover } from '@/features/members/services/get-turnover'
import { getMemberEvents } from '@/features/members/services/get-member-events'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MemberEvent, MembersData, TurnoverData } from '@/features/members/types'

/** Plafond du flux d'activité. La vue DIT quand il est atteint — pas de troncature muette. */
const ACTIVITY_LIMIT = 200

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; from?: string; to?: string }>
}) {
  const profile = await requireAdminOrManager()
  const sp = await searchParams
  const vue = sp.vue === 'turnover' ? 'turnover' : sp.vue === 'activite' ? 'activite' : 'liste'
  // Turnover et Activité suivent le DATEPICKER GLOBAL du header (`?from=&to=`), comme toutes les
  // pages du CRM — `resolvePeriod` est la source unique (défaut : mois en cours). La liste des
  // comptes, elle, n'a pas de période : un membre est là ou il n'est pas là.
  const period = resolvePeriod(sp)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le contenu streame dans son
  // boundary. UNE SEULE des trois lectures est lancée — un onglet ne fait jamais payer sa
  // requête à qui consulte un autre onglet.
  const data = vue === 'liste' ? getMembers() : null
  const turnover = vue === 'turnover' ? getTurnover(period) : null
  const activity =
    vue === 'activite'
      ? getMemberEvents({ from: period.from, to: period.to, limit: ACTIVITY_LIMIT })
      : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <MembersContent
          data={data}
          turnover={turnover}
          activity={activity}
          period={period}
          vue={vue}
          viewer={profile.role === 'admin' ? 'admin' : 'manager'}
          superadmin={profile.superadmin}
        />
      </Suspense>
    </div>
  )
}

async function MembersContent({
  data,
  turnover,
  activity,
  period,
  vue,
  viewer,
  superadmin,
}: {
  data: Promise<MembersData> | null
  turnover: Promise<TurnoverData> | null
  activity: Promise<MemberEvent[]> | null
  period: { from: string; to: string }
  vue: 'liste' | 'turnover' | 'activite'
  viewer: 'admin' | 'manager'
  superadmin: boolean
}) {
  return (
    <MembersTemplate
      data={data ? await data : null}
      turnover={turnover ? await turnover : null}
      activity={
        activity
          ? { events: await activity, from: period.from, to: period.to, limit: ACTIVITY_LIMIT }
          : null
      }
      vue={vue}
      viewer={viewer}
      superadmin={superadmin}
    />
  )
}
