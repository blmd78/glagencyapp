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
  currentUserId,
}: {
  data: InsightsData
  ranking: RankingData
  isAdmin: boolean
  currentUserId: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <InsightsView data={data} ranking={ranking} isAdmin={isAdmin} currentUserId={currentUserId} />
    </div>
  )
}
