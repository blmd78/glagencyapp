import { Suspense } from 'react'
import { getSpendersPage, getSpendersKpis } from '@/features/spenders/services/get-spenders-page'
import { requireAccess } from '@/lib/auth'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { CA_TRACKING_SEUIL } from '@/features/spenders/types'

// Vue « À relancer » — fetch propre à cette page (pattern standard) ; cf. liste/page.tsx
// pour le choix produit (refetch par navigation vs fetch unique de l'ancien layout).
export default async function SpendersTrackerPage() {
  const profile = await requireAccess('crm-spenders')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame dans
  // son boundary quand le RPC répond.
  // PREMIÈRE TRANCHE seulement (0104) : cette vue rapatriait ~9 800 lignes et 3,1 Mo que
  // personne ne parcourt. Le scroll demande la suite, le tri et la recherche repartent en base.
  const data = Promise.all([getSpendersPage({ view: 'tracker', limit: 100 }), getSpendersKpis()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">À relancer</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <SpendersTrackerContent
          data={data}
          isAdmin={profile.role === 'admin'}
          canWrite={profile.role === 'admin' || profile.manager}
        />
      </Suspense>
    </div>
  )
}

async function SpendersTrackerContent({
  data,
  isAdmin,
  canWrite,
}: {
  data: Promise<[Awaited<ReturnType<typeof getSpendersPage>>, Awaited<ReturnType<typeof getSpendersKpis>>]>
  isAdmin: boolean
  canWrite: boolean
}) {
  const [page, kpis] = await data
  return (
    <SpendersTemplate
      data={{ spenders: page.rows, capturedAt: null, threshold: CA_TRACKING_SEUIL }}
      view="tracker"
      isAdmin={isAdmin}
      canWrite={canWrite}
      total={page.total}
      serverKpis={kpis}
    />
  )
}
