import { addDays, frDayLong } from '@glagency/core'
import { InsightsView } from './components/insights-view'
import type { InsightsData, RankingData } from './types'

/**
 * Template Insights : sélecteur des semaines (lundi→dimanche) du mois du datepicker,
 * recherche par chatteur, filtres statut/sévérité. Aucun fetch ici.
 */
export function InsightsTemplate({
  data,
  ranking,
  isAdmin,
  canWrite,
  currentUserId,
}: {
  data: InsightsData
  ranking: RankingData
  isAdmin: boolean
  canWrite: boolean
  currentUserId: string
}) {
  const critical = data.insights.filter((i) => i.severity === 'critical').length
  const open = data.insights.filter((i) => i.status === 'new' || i.status === 'in_progress').length

  return (
    <div className="flex flex-col gap-6">
      {/* -mt-4 : compense le gap-6 déjà posé par le h1 remonté dans page.tsx (streaming
          shell + Suspense) — cf. docs/guidelines-standard-feature.md §2.5. */}
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.weekStart
          ? `S-1 · semaine du ${frDayLong(data.weekStart)} au ${frDayLong(addDays(data.weekStart, 6))}, comparée à la semaine en cours · ${data.insights.length} carte(s) · ${critical} critique(s) · ${open} à traiter`
          : 'Analyses hebdomadaires des quotas par chatteur'}
      </p>
      <InsightsView
        data={data}
        ranking={ranking}
        isAdmin={isAdmin}
        canWrite={canWrite}
        currentUserId={currentUserId}
      />
    </div>
  )
}
