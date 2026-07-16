import { Suspense } from 'react'
import { getSpenders } from '@/features/spenders/services/get-spenders'
import { requireAccess } from '@/lib/auth'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { SpendersListeSkeleton } from '@/features/spenders/components/spenders-liste-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import type { SpendersData } from '@/features/spenders/types'

// Vue « Liste » — fetch propre à cette page (pattern standard). Les 4 vues spenders
// consomment la MÊME donnée complète (le filtrage par vue vit dans SpendersView, côté
// client) : naviguer entre elles refetch désormais à chaque fois — le prix du standard,
// contre le fetch unique de l'ancien layout partagé (choix produit acté).
export default async function SpendersListePage() {
  const profile = await requireAccess('crm-spenders')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, KPIs + table streament
  // dans leur boundary quand le RPC répond.
  const data = getSpenders()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Spenders</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="-mt-4 h-4 w-72" />
            <SpendersListeSkeleton />
          </div>
        }
      >
        <SpendersListeContent data={data} isAdmin={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function SpendersListeContent({
  data,
  isAdmin,
}: {
  data: Promise<SpendersData>
  isAdmin: boolean
}) {
  return <SpendersTemplate data={await data} view="liste" isAdmin={isAdmin} />
}
