import { Suspense } from 'react'
import { getSpendersPage, getSpendersKpis } from '@/features/spenders/services/get-spenders-page'
import { requireAccess } from '@/lib/auth'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { SpendersListeSkeleton } from '@/features/spenders/components/spenders-liste-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { CA_TRACKING_SEUIL } from '@/features/spenders/types'

// Vue « Liste » — fetch propre à cette page (pattern standard). Les 4 vues spenders
// consomment la MÊME donnée complète (le filtrage par vue vit dans SpendersView, côté
// client) : naviguer entre elles refetch désormais à chaque fois — le prix du standard,
// contre le fetch unique de l'ancien layout partagé (choix produit acté).
export default async function SpendersListePage() {
  const profile = await requireAccess('crm-spenders')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, KPIs + table streament
  // dans leur boundary quand le RPC répond.
  // PREMIÈRE TRANCHE seulement (0104) : cette vue rapatriait ~9 800 lignes et 3,1 Mo que
  // personne ne parcourt. Le scroll demande la suite, le tri et la recherche repartent en base.
  const data = Promise.all([getSpendersPage({ view: 'liste', limit: 100 }), getSpendersKpis()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Spenders</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <SpendersListeSkeleton />
          </SectionFallback>
        }
      >
        <SpendersListeContent
          data={data}
          isAdmin={profile.role === 'admin'}
          canWrite={profile.role === 'admin' || profile.manager}
        />
      </Suspense>
    </div>
  )
}

async function SpendersListeContent({
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
      view="liste"
      isAdmin={isAdmin}
      canWrite={canWrite}
      total={page.total}
      serverKpis={kpis}
    />
  )
}
