import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MembersData } from '@/features/members/types'

// Même DA/fonctionnement que la page Membres chatteurs et marketing, adaptée au pôle formation :
// cases = pages frm-* (Overview pour l'instant), pas de section modèles ; les droits des autres
// faces d'un profil sont préservés (fusion côté serveur, `mergePages`).
export default async function FormationMembersPage() {
  const profile = await requireAdmin()
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame
  // dans son boundary quand la lecture répond.
  const data = getMembers()

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
        <MembersContent data={data} superadmin={profile.superadmin} />
      </Suspense>
    </div>
  )
}

async function MembersContent({
  data,
  superadmin,
}: {
  data: Promise<MembersData>
  superadmin: boolean
}) {
  return <MembersTemplate data={await data} scope="formation" superadmin={superadmin} />
}
