import { Suspense } from 'react'
import { getMktModeles } from '@/features/marketing-modeles/services/get-modeles'
import { getSourceNotes } from '@/features/marketing-modeles/services/get-source-notes'
import { MktModelesTemplate } from '@/features/marketing-modeles/ModelesTemplate'
import { getMktGroups } from '@/lib/services/get-mkt-groups'
import { MktModelesSkeleton } from '@/features/marketing-modeles/components/modeles-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktModelesData, MktModelesVue } from '@/features/marketing-modeles/types'

export default async function MktModelesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; vue?: string }>
}) {
  await requireAccess('mkt-modeles')
  const sp = await searchParams
  const period = resolvePeriod(sp)
  // `?vue=` validé ici (un `?vue=nimporte` retombe sur Stats) — cf. `UrlTabs`.
  const vue: MktModelesVue = sp.vue === 'sources' ? 'sources' : 'stats'
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le reste streame dans
  // son boundary quand la lecture répond.
  const data = getMktModeles(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modèles</h1>
      <Suspense
        fallback={
          <SectionFallback subtitle="h-4 w-40">
            <MktModelesSkeleton />
          </SectionFallback>
        }
      >
        <MktModelesContent data={data} vue={vue} />
      </Suspense>
    </div>
  )
}

async function MktModelesContent({ data, vue }: { data: Promise<MktModelesData>; vue: MktModelesVue }) {
  // Les lectures partent ensemble : groupes et notes (quelques dizaines de lignes) ne doivent
  // pas retarder l'affichage des modèles.
  const [d, groups, notes] = await Promise.all([data, getMktGroups(), getSourceNotes()])
  return <MktModelesTemplate data={d} groups={groups} notes={notes} vue={vue} />
}
