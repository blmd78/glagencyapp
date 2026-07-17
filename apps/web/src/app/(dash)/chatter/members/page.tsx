import { Suspense } from 'react'
import { requireAdminOrManager } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MembersData } from '@/features/members/types'

export default async function MembersPage() {
  const profile = await requireAdminOrManager()
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
        <MembersContent
          data={data}
          viewer={profile.role === 'admin' ? 'admin' : 'manager'}
          superadmin={profile.superadmin}
        />
      </Suspense>
    </div>
  )
}

async function MembersContent({
  data,
  viewer,
  superadmin,
}: {
  data: Promise<MembersData>
  viewer: 'admin' | 'manager'
  superadmin: boolean
}) {
  return <MembersTemplate data={await data} viewer={viewer} superadmin={superadmin} />
}
