import { Suspense } from 'react'
import { getSnapCodes } from '@/features/snap-codes/services/get-snap-codes'
import { SnapCodesTemplate } from '@/features/snap-codes/SnapCodesTemplate'
import { requireAccess } from '@/lib/auth'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { SnapCodesData } from '@/features/snap-codes/types'

// Codes Snap (groupe Accès, porté de gla-workflow) — page ASSIGNABLE : lecture pour qui a
// la page, écriture réservée aux admins (adminGuard + RLS snap_codes_admin_all).
export default async function CodesSnapPage() {
  const profile = await requireAccess('codes-snap')
  // Écriture réservée admin (identifiants sensibles) : un accordé non-admin lit en read-only.
  const canWrite = profile.role === 'admin'
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le tableau streame dans
  // son boundary dès que la lecture répond.
  const data = getSnapCodes()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Codes Snap</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <CodesSnapContent data={data} canWrite={canWrite} />
      </Suspense>
    </div>
  )
}

async function CodesSnapContent({ data, canWrite }: { data: Promise<SnapCodesData>; canWrite: boolean }) {
  return <SnapCodesTemplate data={await data} canWrite={canWrite} />
}
