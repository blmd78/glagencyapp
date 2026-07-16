import { Suspense } from 'react'
import { getSnapCodes } from '@/features/snap-codes/services/get-snap-codes'
import { SnapCodesTemplate } from '@/features/snap-codes/SnapCodesTemplate'
import { requireAdmin } from '@/lib/auth'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import type { SnapCodesData } from '@/features/snap-codes/types'

// Codes Snap (groupe Accès, porté de gla-workflow) — page ADMIN, comme dans le legacy.
export default async function CodesSnapPage() {
  await requireAdmin()
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le tableau streame dans
  // son boundary dès que la lecture répond.
  const data = getSnapCodes()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Codes Snap</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="-mt-4 h-4 w-72" />
            <TableSkeleton />
          </div>
        }
      >
        <CodesSnapContent data={data} />
      </Suspense>
    </div>
  )
}

async function CodesSnapContent({ data }: { data: Promise<SnapCodesData> }) {
  return <SnapCodesTemplate data={await data} />
}
