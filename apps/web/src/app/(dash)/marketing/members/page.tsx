import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import type { MembersData } from '@/features/members/types'

// Même DA/fonctionnement que la page Membres chatteurs, adaptée au pôle marketing :
// cases = pages mkt-* (Overview, Liens, Instagram, Twitter, Telegram, Compta), pas de
// section modèles ; les droits chatteurs d'un profil sont préservés (fusion côté serveur).
export default async function MktMembersPage() {
  const profile = await requireAdmin()
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame
  // dans son boundary quand la lecture répond.
  const data = getMembers()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="-mt-4 h-4 w-72" />
            <TableSkeleton />
          </div>
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
  return <MembersTemplate data={await data} scope="marketing" superadmin={superadmin} />
}
