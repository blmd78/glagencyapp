import { Suspense } from 'react'
import { requireAdminOrManager } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { getTurnover } from '@/features/members/services/get-turnover'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MembersData, TurnoverData } from '@/features/members/types'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>
}) {
  const profile = await requireAdminOrManager()
  const { vue: vueParam } = await searchParams
  const vue = vueParam === 'turnover' ? 'turnover' : 'liste'
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le contenu streame dans son
  // boundary. UNE SEULE des deux lectures est lancée — l'onglet Turnover ne fait pas payer son
  // RPC à qui vient consulter la liste, et réciproquement.
  const data = vue === 'liste' ? getMembers() : null
  const turnover = vue === 'turnover' ? getTurnover() : null

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
  vue,
  viewer,
  superadmin,
}: {
  data: Promise<MembersData> | null
  turnover: Promise<TurnoverData> | null
  vue: 'liste' | 'turnover'
  viewer: 'admin' | 'manager'
  superadmin: boolean
}) {
  return (
    <MembersTemplate
      data={data ? await data : null}
      turnover={turnover ? await turnover : null}
      vue={vue}
      viewer={viewer}
      superadmin={superadmin}
    />
  )
}
