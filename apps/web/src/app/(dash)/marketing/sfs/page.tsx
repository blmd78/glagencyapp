import { Suspense } from 'react'
import { getMktDashboard } from '@/features/marketing-dashboard/services/get-dashboard'
import { MktDashboardTemplate } from '@/features/marketing-dashboard/DashboardTemplate'
import { MktDashboardSkeleton } from '@/features/marketing-dashboard/components/mkt-dashboard-skeleton'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktDashboardData } from '@/features/marketing-dashboard/types'

// Onglet SFS : le même écran que l'Overview, sur les seuls liens du groupe `sfs` — qui sortent,
// eux, de l'Overview et de Modèles (`lib/mkt-sfs.ts`).
export default async function MktSfsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-sfs')
  const period = resolvePeriod(await searchParams)
  const data = getMktDashboard(period, 'sfs')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">SFS</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <MktDashboardSkeleton />
          </SectionFallback>
        }
      >
        <MktSfsContent data={data} />
      </Suspense>
    </div>
  )
}

async function MktSfsContent({ data }: { data: Promise<MktDashboardData> }) {
  const d = await data
  // Aucune ligne journalière : soit pas de SFS sur la période, soit pas encore de groupe `sfs`.
  if (d.daily.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Aucun lien SFS sur la période</CardTitle>
          <CardDescription>
            Un lien est SFS quand il est dans le groupe « SFS » (Marketing › Liens, bouton Groupes) :
            le groupe reconnaît le mot « sfs » dans le nom du lien, et un lien nommé autrement se range
            à la main depuis son badge.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <MktDashboardTemplate data={d} />
}
