import { Suspense } from 'react'
import { getMktStaff } from '@/features/marketing-staff/services/get-staff'
import { MktVaTemplate } from '@/features/marketing-staff/VaTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktStaffData } from '@/features/marketing-staff/types'

export default async function MktVaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('mkt-staff')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame dans
  // son boundary quand la lecture répond.
  const data = getMktStaff(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">VA</h1>
      <Suspense
        fallback={
          <SectionFallback subtitle="h-4 w-96">
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <MktVaContent data={data} isAdmin={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function MktVaContent({
  data,
  isAdmin,
}: {
  data: Promise<MktStaffData>
  isAdmin: boolean
}) {
  return <MktVaTemplate data={await data} isAdmin={isAdmin} />
}
