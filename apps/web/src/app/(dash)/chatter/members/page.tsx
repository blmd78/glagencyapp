import { Suspense } from 'react'
import { requireAdminOrManager } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { getMembers } from '@/features/members/services/get-members'
import { getTurnover } from '@/features/members/services/get-turnover'
import { getEventMemberOptions, getMemberEvents } from '@/features/members/services/get-member-events'
import { resolveFilter } from '@/lib/roster'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { MembersSkeleton } from '@/features/members/components/members-skeleton'
import type { MembersData, TurnoverData } from '@/features/members/types'
import type { SelectableMember } from '@/lib/types/member'
import type { MemberEvent } from '@/features/members/types'

interface ActivityData {
  events: MemberEvent[]
  members: SelectableMember[]
  selectedMember: string | null
}

/**
 * Le filtre `?membre=` est validé PAR APPARTENANCE à la liste (`resolveFilter`, patron du Planning)
 * — un id inconnu ou mal formé est ignoré. Séquentiel et non parallèle : la liste doit exister
 * AVANT de décider si le filtre est valide, sinon on lirait les événements d'un id refusé ensuite
 * par le sélecteur, et l'écran afficherait « Tous les membres » au-dessus d'une liste filtrée.
 */
async function loadActivity(
  period: { from: string; to: string },
  membre: string | undefined,
): Promise<ActivityData> {
  const members = await getEventMemberOptions()
  const selectedMember = resolveFilter(members, membre)
  const events = await getMemberEvents({
    profileId: selectedMember ?? undefined,
    from: period.from,
    to: period.to,
    limit: ACTIVITY_LIMIT,
  })
  return { events, members, selectedMember }
}

/** Plafond du flux d'activité. La vue DIT quand il est atteint — pas de troncature muette. */
const ACTIVITY_LIMIT = 200

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; from?: string; to?: string; membre?: string }>
}) {
  const profile = await requireAdminOrManager()
  const sp = await searchParams
  // Activité : ADMINS uniquement (décision Benoit 2026-08-06, miroir RLS 0108) — un
  // `?vue=activite` forgé par un manager retombe sur la liste, et sa lecture n'est jamais lancée.
  const isAdmin = profile.role === 'admin'
  const vue =
    sp.vue === 'turnover' ? 'turnover' : sp.vue === 'activite' && isAdmin ? 'activite' : 'liste'
  // Turnover et Activité suivent le DATEPICKER GLOBAL du header (`?from=&to=`), comme toutes les
  // pages du CRM — `resolvePeriod` est la source unique (défaut : mois en cours). La liste des
  // comptes, elle, n'a pas de période : un membre est là ou il n'est pas là.
  const period = resolvePeriod(sp)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le contenu streame dans son
  // boundary. UNE SEULE des trois lectures est lancée — un onglet ne fait jamais payer sa
  // requête à qui consulte un autre onglet.
  const data = vue === 'liste' ? getMembers() : null
  const turnover = vue === 'turnover' ? getTurnover(period) : null
  const activity = vue === 'activite' ? loadActivity(period, sp.membre) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <MembersSkeleton />
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
  activity: Promise<ActivityData> | null
  period: { from: string; to: string }
  vue: 'liste' | 'turnover' | 'activite'
  viewer: 'admin' | 'manager'
  superadmin: boolean
}) {
  return (
    <MembersTemplate
      data={data ? await data : null}
      turnover={turnover ? await turnover : null}
      activity={activity ? { ...(await activity), from: period.from, to: period.to, limit: ACTIVITY_LIMIT } : null}
      vue={vue}
      viewer={viewer}
      superadmin={superadmin}
    />
  )
}
