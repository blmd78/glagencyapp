import { Suspense } from 'react'
import { getSpenders } from '@/features/spenders/services/get-spenders'
import { requireAccess } from '@/lib/auth'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { SpendersData } from '@/features/spenders/types'

// Vue « Archive » — fetch propre à cette page (pattern standard) ; cf. liste/page.tsx
// pour le choix produit (refetch par navigation vs fetch unique de l'ancien layout).
export default async function SpendersArchivePage() {
  const profile = await requireAccess('crm-spenders')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame dans
  // son boundary quand le RPC répond.
  const data = getSpenders()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <SpendersArchiveContent data={data} isAdmin={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function SpendersArchiveContent({
  data,
  isAdmin,
}: {
  data: Promise<SpendersData>
  isAdmin: boolean
}) {
  return <SpendersTemplate data={await data} view="archive" isAdmin={isAdmin} />
}
