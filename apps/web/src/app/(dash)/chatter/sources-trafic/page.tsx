import { Suspense } from 'react'
import { getSourcesTrafic } from '@/features/sources-trafic/services/get-sources-trafic'
import { SourcesTraficTemplate } from '@/features/sources-trafic/SourcesTraficTemplate'
import { SourcesTraficSkeleton } from '@/features/sources-trafic/components/sources-trafic-skeleton'
import { requireAccess } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { SourcesTraficData } from '@/features/sources-trafic/types'

// Équipe › Sources de trafic (demande Benoit 2026-09-23). Droit `sources-trafic` cochable dans
// Membres ; la RLS cloisonne un membre aux notes de SES modèles (0171, admin = toutes). Mise en
// page de lecture, comme Infos modèles.
export default async function SourcesTraficPage() {
  await requireAccess('sources-trafic')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la liste streame dans son
  // boundary dès que la lecture répond.
  const data = getSourcesTrafic()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sources de trafic</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <SourcesTraficSkeleton />
          </SectionFallback>
        }
      >
        <SourcesTraficContent data={data} />
      </Suspense>
    </div>
  )
}

async function SourcesTraficContent({ data }: { data: Promise<SourcesTraficData> }) {
  return <SourcesTraficTemplate data={await data} />
}
