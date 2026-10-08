import { Suspense } from 'react'
import { getMktDashboard } from '@/features/marketing-dashboard/services/get-dashboard'
import { MktDashboardTemplate } from '@/features/marketing-dashboard/DashboardTemplate'
import { MktDashboardSkeleton } from '@/features/marketing-dashboard/components/mkt-dashboard-skeleton'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import type { MktDashboardData } from '@/features/marketing-dashboard/types'
import { liensVue } from '@/features/marketing-liens/link-options'
import { LiensSection, type LiensSearchParams } from '../_liens/liens-section'

const ENSEMBLE = 'ensemble'

// Onglet SFS : tout ce qui touche aux liens du groupe `sfs`, qui sortent de l'Overview, de Modèles
// et de Liens tracking (`lib/mkt-sfs.ts`). Un seul jeu d'onglets (décision Benoit 2026-10-08) :
// « Vue d'ensemble » (l'écran de l'Overview), puis « Classement » et « Graphique » (ceux de Liens
// tracking), tous sur les SFS seuls.
export default async function MktSfsPage({ searchParams }: { searchParams: Promise<LiensSearchParams> }) {
  await requireAccess('mkt-sfs')
  const sp = await searchParams
  const period = resolvePeriod(sp)
  // La Vue d'ensemble n'est lue que si elle est affichée — comme le Graphique de Liens tracking.
  const ensemble = liensVue(sp.vue, ENSEMBLE) === ENSEMBLE

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">SFS</h1>
      <LiensSection
        sp={sp}
        period={period}
        scope="sfs"
        lead={{
          value: ENSEMBLE,
          label: "Vue d'ensemble",
          content: ensemble ? (
            <Suspense fallback={<MktDashboardSkeleton />}>
              <MktSfsContent data={getMktDashboard(period, 'sfs')} />
            </Suspense>
          ) : null,
        }}
      />
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
