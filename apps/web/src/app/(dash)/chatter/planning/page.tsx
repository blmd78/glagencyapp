import { Suspense } from 'react'
import { getPlanning, getPlanningMembers } from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { PlanningSkeleton } from '@/features/planning/components/planning-skeleton'
import { requireAccess } from '@/lib/auth'
import type { PlanningMember } from '@/features/planning/types'

/**
 * Planning journalier : chacun voit LE SIEN (RLS). Le sélecteur `?membre=` s'ouvre sur les
 * personnes qu'on peut gérer (superadmin → tout ; admin → managers/sous-managers ; manager →
 * ses sous-managers directs ; sous-manager → personne). Édition selon `canEdit` (miroir RLS).
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string }>
}) {
  const profile = await requireAccess('planning')
  const { membre } = await searchParams

  // Kickoff SANS await : le header (titre + sélecteur) est un widget client
  // (`PlanningHeader`, useRouter) qui a besoin de `members` — pas de h1 « immédiat »
  // séparable sans casser la mise en page (titre et sélecteur sur la même ligne, cf.
  // docs/guidelines-data-loading.md §3 « widget d'en-tête couplé à un hook »). Tout le
  // composite streame dans un seul boundary. `[]` pour sous-manager/chatteur.
  const membersPromise = getPlanningMembers(profile.baseRole)

  return (
    <Suspense fallback={<PlanningSkeleton />}>
      <PlanningContent
        profileId={profile.id}
        selfName={profile.displayName ?? profile.email ?? 'Moi'}
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
  superadmin,
  membre,
  membersPromise,
}: {
  profileId: string
  selfName: string
  superadmin: boolean
  membre?: string
  membersPromise: Promise<PlanningMember[]>
}) {
  // Personnes gérables (hors soi). S'il n'y en a aucune → pas de sélecteur, on ouvre le sien.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const hasSelect = others.length > 0
  // SOI-MÊME en tête du sélecteur (on doit pouvoir rouvrir SON propre planning — celui qu'un
  // rôle au-dessus nous a préparé). `role: 'admin'` = sentinelle « pas de suffixe » dans le libellé.
  const members: PlanningMember[] = hasSelect
    ? [{ id: profileId, name: `${selfName} (moi)`, role: 'admin' }, ...others]
    : []
  const target = membre && members.some((m) => m.id === membre) ? membre : (members[0]?.id ?? profileId)
  // Édition : on ne modifie jamais SON propre planning (préparé par un rôle au-dessus) ; le
  // superadmin fait exception (il est au sommet). RLS 0043/0061 + requireCanEdit = la vraie défense.
  const canEdit = superadmin || target !== profileId
  return (
    <PlanningTemplate
      data={await getPlanning(target)}
      hasSelect={hasSelect}
      canEdit={canEdit}
      members={members}
    />
  )
}
