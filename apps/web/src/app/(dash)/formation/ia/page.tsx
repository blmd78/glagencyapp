import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { AiTemplate } from '@/features/training-ai/AiTemplate'
import { AiSkeleton } from '@/features/training-ai/components/ai-skeleton'
import { getAiUsage } from '@/features/training-ai/services/get-ai-usage'
import type { AiUsageData } from '@/features/training-ai/types'

/**
 * Analytics IA de la Formation — ADMIN seulement : la page dit ce que l'entraînement coûte, et
 * la dépense d'un outil n'a pas à circuler dans l'encadrement.
 */
export default async function FormationIaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const [, params] = await Promise.all([requireAdmin(), searchParams])
  // Le datepicker du header pilote la page (exception déclarée dans `HeaderPeriod`) — défaut
  // `resolvePeriod` = mois en cours.
  const period = resolvePeriod(params)
  // Kickoff SANS await : le h1 s'affiche tout de suite, les agrégats streament ensuite.
  const data = getAiUsage(period)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics IA</h1>
      <Suspense
        fallback={
          <SectionFallback subtitle="h-4 w-56">
            <AiSkeleton />
          </SectionFallback>
        }
      >
        <AiContent data={data} />
      </Suspense>
    </div>
  )
}

async function AiContent({ data }: { data: Promise<AiUsageData> }) {
  return <AiTemplate data={await data} />
}
