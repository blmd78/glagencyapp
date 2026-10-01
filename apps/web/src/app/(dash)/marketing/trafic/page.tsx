import { Suspense } from 'react'
import { getTrafic } from '@/features/marketing-trafic/services/get-trafic'
import { TraficTemplate } from '@/features/marketing-trafic/TraficTemplate'
import { TraficSkeleton } from '@/features/marketing-trafic/components/trafic-skeleton'
import { hasWriteAccess, requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { TraficData } from '@/features/marketing-trafic/types'

export default async function MktTraficPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('mkt-trafic')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le h1 s'affiche tout de suite, le reste streame dans sa boundary.
  const data = getTrafic(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Trafic</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TraficSkeleton />
          </SectionFallback>
        }
      >
        <TraficContent data={data} canEdit={hasWriteAccess(profile, 'mkt-trafic')} />
      </Suspense>
    </div>
  )
}

async function TraficContent({ data, canEdit }: { data: Promise<TraficData>; canEdit: boolean }) {
  return <TraficTemplate data={await data} canEdit={canEdit} />
}
