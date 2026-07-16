import { Suspense } from 'react'
import { getHealth } from '@/features/health/services/get-health'
import { requireAccess } from '@/lib/auth'
import { HealthTemplate } from '@/features/health/HealthTemplate'
import { HealthSkeleton } from '@/features/health/components/health-skeleton'
import { resolvePeriod } from '@/lib/period'
import { Skeleton } from '@/components/ui/skeleton'
import type { HealthData } from '@/features/health/types'

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('health')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le bloc de données
  // (jauge + KPIs + cartes modèles) streame dans son boundary quand le RPC répond.
  const data = getHealth(period, { restricted: profile.role !== 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">État de santé</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="-mt-4 h-4 w-72" />
            <HealthSkeleton />
          </div>
        }
      >
        <HealthContent data={data} />
      </Suspense>
    </div>
  )
}

async function HealthContent({ data }: { data: Promise<HealthData> }) {
  return <HealthTemplate data={await data} />
}
