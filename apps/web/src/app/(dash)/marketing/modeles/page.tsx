import { Suspense } from 'react'
import { getMktModeles } from '@/features/marketing-modeles/services/get-modeles'
import { MktModelesTemplate } from '@/features/marketing-modeles/ModelesTemplate'
import { MktModelesSkeleton } from '@/features/marketing-modeles/components/modeles-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktModelesData } from '@/features/marketing-modeles/types'

export default async function MktModelesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-modeles')
  const period = resolvePeriod(await searchParams)
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
        <MktModelesContent data={data} />
      </Suspense>
    </div>
  )
}

async function MktModelesContent({ data }: { data: Promise<MktModelesData> }) {
  return <MktModelesTemplate data={await data} />
}
