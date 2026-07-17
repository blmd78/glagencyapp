import { Suspense } from 'react'
import { getSpenders } from '@/features/spenders/services/get-spenders'
import { requireAccess } from '@/lib/auth'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { R_ALERTE, type SpendersData } from '@/features/spenders/types'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'

// Vue « Alertes R10 » — fetch propre à cette page (pattern standard) ; cf. liste/page.tsx
// pour le choix produit (refetch par navigation vs fetch unique de l'ancien layout).
export default async function SpendersAlertesPage() {
  const profile = await requireAccess('crm-spenders')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame dans
  // son boundary quand le RPC répond.
  const data = getSpenders()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{`Alertes R${R_ALERTE}`}</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <SpendersAlertesContent data={data} isAdmin={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function SpendersAlertesContent({
  data,
  isAdmin,
}: {
  data: Promise<SpendersData>
  isAdmin: boolean
}) {
  return <SpendersTemplate data={await data} view="alertes" isAdmin={isAdmin} />
}
