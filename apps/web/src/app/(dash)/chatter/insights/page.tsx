import { Suspense } from 'react'
import { getInsights } from '@/features/insights/services/get-insights'
import { getRanking } from '@/features/insights/services/get-ranking'
import { InsightsTemplate } from '@/features/insights/InsightsTemplate'
import { InsightsSkeleton } from '@/features/insights/components/insights-skeleton'
import { ExportCsvButton } from '@/features/insights/components/export-csv-button'
import { requireAccess } from '@/lib/auth'
import type { InsightsData } from '@/features/insights/types'

// La page montre TOUJOURS S-1 (dernière semaine complète générée), comparée à la
// semaine en cours dans les cartes — bascule automatique chaque lundi, pas de sélecteur.
export default async function InsightsPage() {
  const profile = await requireAccess('insights')
  const isAdmin = profile.role === 'admin'
  // Kickoff SANS await : le shell (h1 + export CSV, déjà connus) s'affiche immédiatement,
  // cartes + classement streament dans leur boundary. `ranking` dépend de `data.weekStart`
  // (vraie dépendance séquentielle) → composant async imbriqué dans le MÊME Suspense (pas
  // de 2e boundary, la donnée n'a de sens qu'ensemble).
  const data = getInsights(undefined, { restricted: !isAdmin })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        {isAdmin && <ExportCsvButton />}
      </div>
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsContent data={data} isAdmin={isAdmin} currentUserId={profile.id} />
      </Suspense>
    </div>
  )
}

async function InsightsContent({
  data,
  isAdmin,
  currentUserId,
}: {
  data: Promise<InsightsData>
  isAdmin: boolean
  currentUserId: string
}) {
  const resolved = await data
  const ranking = await getRanking(resolved.weekStart)
  return (
    <InsightsTemplate data={resolved} ranking={ranking} isAdmin={isAdmin} currentUserId={currentUserId} />
  )
}
