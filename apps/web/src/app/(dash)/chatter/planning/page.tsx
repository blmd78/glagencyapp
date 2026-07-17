import { Suspense } from 'react'
import { getPlanning, getPlanningMembers } from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { PlanningSkeleton } from '@/features/planning/components/planning-skeleton'
import { requireAccess } from '@/lib/auth'
import type { PlanningMember } from '@/features/planning/types'

/**
 * Planning journalier : un membre (sous-manager) voit LE SIEN (RLS), un admin choisit
 * le membre via `?membre=` et édite (blocs, priorité, annexes).
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string }>
}) {
  const profile = await requireAccess('planning')
  const { membre } = await searchParams
  const isAdmin = profile.role === 'admin'

  // Kickoff SANS await : le header (titre + sélecteur de membre admin) est un widget
  // client (`PlanningHeader`, useRouter) qui a besoin de `members` — pas de h1 « immédiat »
  // séparable ici sans casser la mise en page (titre et sélecteur sur la même ligne, cf.
  // docs/guidelines-data-loading.md §3 « widget d'en-tête couplé à un hook »). Tout le
  // composite streame dans un seul boundary.
  const membersPromise = isAdmin ? getPlanningMembers(profile.superadmin) : null

  return (
    <Suspense fallback={<PlanningSkeleton />}>
      <PlanningContent
        profileId={profile.id}
        selfName={profile.displayName ?? profile.email ?? 'Moi'}
        isAdmin={isAdmin}
        superadmin={profile.superadmin}
        membre={membre}
        membersPromise={membersPromise}
      />
    </Suspense>
  )
}

async function PlanningContent({
  profileId,
  selfName,
  isAdmin,
  superadmin,
  membre,
  membersPromise,
}: {
  profileId: string
  selfName: string
  isAdmin: boolean
  superadmin: boolean
  membre?: string
  membersPromise: Promise<PlanningMember[]> | null
}) {
  if (!isAdmin || !membersPromise) {
    return (
      <PlanningTemplate
        data={await getPlanning(profileId)}
        isAdmin={false}
        canEdit={false}
        members={[]}
      />
    )
  }

  // Sélecteur : SOI-MÊME en tête (un admin doit pouvoir OUVRIR son propre planning —
  // celui que le superadmin lui a préparé), puis superadmin → membres + admins ;
  // admin → membres uniquement. Édition : un admin consulte le sien en LECTURE SEULE
  // (« le planning d'un admin n'est modifiable que par un superadmin » — garde
  // requireCanEdit + RLS 0043, qui restent la défense contre un appel forgé).
  const fetched = await membersPromise
  const members: PlanningMember[] = [
    { id: profileId, name: `${selfName} (moi)`, role: 'admin' },
    ...fetched.filter((m) => m.id !== profileId),
  ]
  const target = membre && members.some((m) => m.id === membre) ? membre : (members[0]?.id ?? null)
  const canEditTarget = superadmin || (target !== null && target !== profileId)
  return (
    <PlanningTemplate
      data={target ? await getPlanning(target) : null}
      isAdmin
      canEdit={canEditTarget}
      members={members}
    />
  )
}
