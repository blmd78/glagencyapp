import { Suspense } from 'react'
import { getMktLinks } from '@/features/marketing-liens/services/get-links'
import { MktLiensTemplate } from '@/features/marketing-liens/LiensTemplate'
import { MktLiensSkeleton } from '@/features/marketing-liens/components/liens-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktLinksData } from '@/features/marketing-liens/types'

export default async function MktLiensPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-liens')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, KPIs + table streament
  // dans leur boundary quand la lecture répond.
  const data = getMktLinks(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Liens de tracking</h1>
      <Suspense
        fallback={
          <SectionFallback subtitle="h-4 w-32">
            <MktLiensSkeleton />
          </SectionFallback>
        }
      >
        <MktLiensContent data={data} />
      </Suspense>
    </div>
  )
}

async function MktLiensContent({ data }: { data: Promise<MktLinksData> }) {
  return <MktLiensTemplate data={await data} />
}
