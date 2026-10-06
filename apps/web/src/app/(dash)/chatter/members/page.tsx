import { Suspense } from 'react'
import { requireAdminOrManager } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { getMembers } from '@/features/members/services/get-members'
import { getTurnover } from '@/features/members/services/get-turnover'
import { getEventMemberOptions, getMemberEvents } from '@/features/members/services/get-member-events'
import { getFichesMyPuls } from '@/features/members/services/get-fiches-mypuls'
import { resolveFilter } from '@/lib/roster'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { MembersSkeleton } from '@/features/members/components/members-skeleton'
import type { IdentityData, MembersData, TurnoverData } from '@/features/members/types'
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

/**
 * Budget de durée des Server Actions de cette route. LE FILET ADMIN DE LA REPRISE GLA POSTE ICI,
 * pas sur Ma formation : `linkLegacyAccount` / `resyncLegacyAccount` écrivent jusqu'à ~9 300 lignes
 * puis recalculent tous les agrégats du membre. Le défaut de 15 s ne suffit pas — au dépassement
 * l'admin reçoit « Récupération partielle — relancez Resynchroniser », jamais un 500 muet.
 * Patron du projet sous `cacheComponents: true` : `formation/overview/page.tsx:16`.
 */
export const maxDuration = 300

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; from?: string; to?: string; membre?: string }>
}) {
  const profile = await requireAdminOrManager()
  const sp = await searchParams
  // Activité (décision Benoit 2026-08-06, miroir RLS 0108) et Fiches MyPuls (tables de 0183) :
  // ADMINS uniquement — un `?vue=` forgé par un manager retombe sur la liste, et la lecture n'est
  // jamais lancée (les RPC `security invoker` lui rendraient des chiffres PARTIELS, sans erreur).
  const isAdmin = profile.role === 'admin'
  const vue =
    sp.vue === 'turnover'
      ? 'turnover'
      : sp.vue === 'activite' && isAdmin
        ? 'activite'
        : sp.vue === 'fiches' && isAdmin
          ? 'fiches'
          : 'liste'
  // Turnover, Activité et Fiches MyPuls suivent le DATEPICKER GLOBAL du header (`?from=&to=`),
  // comme toutes les pages du CRM — `resolvePeriod` est la source unique (défaut : mois en cours).
  // La liste des comptes, elle, n'a pas de période : un membre est là ou il n'est pas là.
  const period = resolvePeriod(sp)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le contenu streame dans son
  // boundary. UNE SEULE des quatre lectures est lancée — un onglet ne fait jamais payer sa
  // requête à qui consulte un autre onglet.
  const data = vue === 'liste' ? getMembers() : null
  const turnover = vue === 'turnover' ? getTurnover(period) : null
  const activity = vue === 'activite' ? loadActivity(period, sp.membre) : null
  const identity = vue === 'fiches' ? getFichesMyPuls(period) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
      <Suspense
        fallback={
          <SectionFallback>
            {/* Admin : Comptes, Turnover, Activité, Fiches MyPuls ; manager : Comptes, Turnover. */}
            <MembersSkeleton tabs={isAdmin ? 4 : 2} />
          </SectionFallback>
        }
      >
        <MembersContent
          data={data}
          turnover={turnover}
          activity={activity}
          identity={identity}
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
  identity,
  period,
  vue,
  viewer,
  superadmin,
}: {
  data: Promise<MembersData> | null
  turnover: Promise<TurnoverData> | null
  activity: Promise<ActivityData> | null
  identity: Promise<IdentityData> | null
  period: { from: string; to: string }
  vue: 'liste' | 'turnover' | 'activite' | 'fiches'
  viewer: 'admin' | 'manager'
  superadmin: boolean
}) {
  return (
    <MembersTemplate
      data={data ? await data : null}
      turnover={turnover ? await turnover : null}
      activity={activity ? { ...(await activity), from: period.from, to: period.to, limit: ACTIVITY_LIMIT } : null}
      identity={identity ? await identity : null}
      period={period}
      vue={vue}
      viewer={viewer}
      superadmin={superadmin}
    />
  )
}
