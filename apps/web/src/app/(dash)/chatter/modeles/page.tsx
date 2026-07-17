import { Suspense } from 'react'
import { getModels } from '@/features/models/services/get-models'
import { requireAccess } from '@/lib/auth'
import { ModelsTemplate } from '@/features/models/ModelsTemplate'
import { resolvePeriod } from '@/lib/period'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { ModelsData } from '@/features/models/types'

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('modeles')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame dans son
  // boundary quand le RPC répond.
  const data = getModels(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modèles</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <ModelsContent data={data} />
      </Suspense>
    </div>
  )
}

async function ModelsContent({ data }: { data: Promise<ModelsData> }) {
  return <ModelsTemplate data={await data} />
}
