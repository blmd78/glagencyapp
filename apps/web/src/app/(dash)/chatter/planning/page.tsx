import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  getPlanning,
  getPlanningMembers,
  getPlanningOwners,
} from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'
import { MemberSelect } from '@/components/member-select'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAccess } from '@/lib/auth'
import { applyFilter, resolveFilter, selfLabel } from '@/lib/roster'
import type { PlanningEntry, PlanningMember } from '@/features/planning/types'

/**
 * Emploi du temps : le planning journalier des membres. La to-do personnelle qui partageait la
 * page (`?vue=todo`) est supprimée le 2026-10-02 (décision Benoit) — la to-do d'équipe vit dans
 * Présence › To-Do ; un vieux lien `?vue=todo` affiche simplement le planning.
 * Périmètre des personnes : superadmin → tout, superadmins compris ; admin → managers/
 * sous-managers ; manager → ses sous-managers directs ; sous-manager → personne. Le sélecteur
 * `?membre=` est un FILTRE sur une pile de noms dépliables (sans filtre, tout le monde est
 * empilé ; avec, la personne seule, à plat). On n'édite pas SON planning (sauf superadmin).
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string }>
}) {
  const profile = await requireAccess('planning')
  // Jamais de chatteur (matrice), même si un admin lui a coché le slug 'planning'.
  // /no-access et pas landingHref : éviter la boucle si 'planning' est sa seule page autorisée.
  if (profile.baseRole === 'chatteur') redirect('/no-access')
  const { membre } = await searchParams

  // Kickoff SANS await : la liste des personnes conditionne tout le composite (sélecteur et
  // accordéons du planning) — il streame dans un seul boundary. `[]` pour sous-manager.
  const membersPromise = getPlanningMembers(profile.baseRole)

  return (
    <div className="flex flex-col gap-6">
      {/* `h1` HORS du `<Suspense>` : il ne dépend d'aucune donnée async (juste le rôle, déjà
          résolu par `requireAccess`) et doit rester affiché pendant tout le streaming — sinon
          titre + sélecteur disparaissent puis réapparaissent (clignotement). TOUT le
          reste est dans le boundary — le sélecteur y compris, puisqu'il dépend de
          `membersPromise` ; sa silhouette de secours (ci-dessous) enchaîne sans saut visible
          avec celle de `loading.tsx`. */}
      <h1 className="text-2xl font-semibold tracking-tight">Emploi du temps</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div aria-hidden="true" className="flex justify-end">
              <Skeleton className="h-9 w-52" />
            </div>
            <RowsSkeleton />
          </div>
        }
      >
        <PlanningContent
          profileId={profile.id}
          selfName={profile.displayName ?? profile.email ?? 'Moi'}
          superadmin={profile.superadmin}
          membre={membre}
          membersPromise={membersPromise}
        />
      </Suspense>
    </div>
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
  // Personnes gérables (hors soi), SOI-MÊME en tête. `role: ''` = pas de suffixe de rôle.
  // Le « (moi) » ne sert qu'à se distinguer des autres : inutile quand on est seul.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const roster: PlanningMember[] = [
    { id: profileId, name: selfLabel(selfName, others), role: '', hasPlanningPage: true },
    ...others,
  ]
  // `?membre=` est un FILTRE : absent = tout le monde empilé, présent = cette personne seule,
  // affichée à plat.
  const filterId = resolveFilter(roster, membre)
  const shown = applyFilter(roster, filterId)

  // Le planning a son PROPRE boundary : sans lui, `PlanningContent` attendrait toute la chaîne
  // (membres → plannings → blocs, 3 allers-retours en série) avant de rendre quoi que ce soit,
  // alors que le sélecteur ne dépend que du premier. La coquille part dès `membersPromise`
  // résolu, et le planning la rejoint en streaming.
  return (
    <div className="flex flex-col gap-6">
      {others.length > 0 && (
        <div className="flex justify-end">
          <MemberSelect members={roster} value={filterId} allowAll />
        </div>
      )}
      <Suspense fallback={<RowsSkeleton />}>
        <PlanningTab members={shown} profileId={profileId} superadmin={superadmin} />
      </Suspense>
    </div>
  )
}

/**
 * Le planning — isolé pour que son chargement ne retienne pas la coquille.
 *
 * Une seule personne à afficher → rendu à plat : on charge SON planning tout de suite, il n'y a
 * pas d'accordéon à déplier. Sinon on ne charge que « qui a un planning » (repère de la ligne
 * repliée) ; les blocs partent à l'ouverture (`loadPlanning`). Sans ça, dérouler 19 noms
 * embarquerait les blocs des 19 dans le premier rendu.
 */
async function PlanningTab({
  members,
  profileId,
  superadmin,
}: {
  members: PlanningMember[]
  profileId: string
  superadmin: boolean
}) {
  const single = members.length === 1
  const [data, owners] = await Promise.all([
    single ? getPlanning(members[0].id) : Promise.resolve(null),
    single ? Promise.resolve(new Set<string>()) : getPlanningOwners(members.map((m) => m.id)),
  ])
  // On ne modifie jamais SON propre planning (préparé par un rôle au-dessus) ; le superadmin
  // fait exception. La RLS 0043/0061 + `requireCanEdit` restent la vraie défense — `canEdit`
  // n'est qu'optimiste côté UI.
  const entries: PlanningEntry[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    hasPlanning: single ? (data?.exists ?? false) : owners.has(m.id),
    canEdit: superadmin || m.id !== profileId,
  }))
  return <PlanningTemplate entries={entries} data={data} />
}
