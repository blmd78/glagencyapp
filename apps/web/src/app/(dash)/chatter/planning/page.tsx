import { Suspense } from 'react'
import { redirect } from 'next/navigation'
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
  // Planning = jamais de chatteur (matrice), même si un admin lui a coché le slug 'planning'.
  // /no-access et pas landingHref : éviter la boucle si 'planning' est sa seule page autorisée.
  if (profile.baseRole === 'chatteur') redirect('/no-access')
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
  // Personnes gérables (hors soi). S'il n'y en a aucune → pas de sélecteur (members vide),
  // on ouvre le sien. SOI-MÊME en tête (on doit pouvoir rouvrir SON planning, préparé par un
  // rôle au-dessus). `role: ''` = pas de suffixe de rôle dans le libellé du combobox.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const members: PlanningMember[] = others.length
    ? [{ id: profileId, name: `${selfName} (moi)`, role: '' }, ...others]
    : []
  const target = membre && members.some((m) => m.id === membre) ? membre : profileId
  // Édition : on ne modifie jamais SON propre planning (préparé par un rôle au-dessus) ; le
  // superadmin fait exception (il est au sommet). RLS 0043/0061 + requireCanEdit = la vraie défense.
  const canEdit = superadmin || target !== profileId
  return <PlanningTemplate data={await getPlanning(target)} canEdit={canEdit} members={members} />
}
