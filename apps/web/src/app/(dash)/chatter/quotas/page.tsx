import { Suspense } from 'react'
import { getQuotas } from '@/features/quotas/services/get-quotas'
import { requireAdmin } from '@/lib/auth'
import { QuotasTemplate } from '@/features/quotas/QuotasTemplate'
import { QuotasSkeleton } from '@/features/quotas/components/quotas-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { QuotasData } from '@/features/quotas/types'

// Page de config (seuils journaliers + exclusions) — pas de filtre période.
export default async function QuotasPage() {
  await requireAdmin()
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, l'éditeur streame dans
  // son boundary dès que la lecture répond.
  const data = getQuotas()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quotas</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <QuotasSkeleton />
          </SectionFallback>
        }
      >
        <QuotasContent data={data} />
      </Suspense>
    </div>
  )
}

async function QuotasContent({ data }: { data: Promise<QuotasData> }) {
  return <QuotasTemplate data={await data} />
}
