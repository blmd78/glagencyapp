import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { getStatChatteur } from '@/features/stat-chatteur/services/get-stat-chatteur'
import { StatChatteurTemplate } from '@/features/stat-chatteur/StatChatteurTemplate'
import { StatChatteurSkeleton } from '@/features/stat-chatteur/components/stat-chatteur-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { StatChatteurData } from '@/features/stat-chatteur/types'

export default async function StatChatteurPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('stat-chatteur')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await (pattern streaming, cf. chatters/page.tsx) : le shell (h1) s'affiche
  // immédiatement, le bloc KPIs + classement streame dans son boundary quand la donnée répond.
  const data = getStatChatteur(period, { restricted: profile.role !== 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stat chatteur</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <StatChatteurSkeleton />
          </SectionFallback>
        }
      >
        <StatChatteurContent data={data} />
      </Suspense>
    </div>
  )
}

async function StatChatteurContent({ data }: { data: Promise<StatChatteurData> }) {
  return <StatChatteurTemplate data={await data} />
}
