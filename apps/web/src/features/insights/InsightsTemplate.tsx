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
  return (
    <div className="flex flex-col gap-6">
      {/* -mt-4 : compense le gap-6 déjà posé par le h1 remonté dans page.tsx (streaming
          shell + Suspense) — cf. docs/guidelines-standard-feature.md §2.5.
          Les COMPTEURS (cartes / critiques / à traiter) ont quitté cette ligne : ils sont
          désormais dans les cartes KPI juste en dessous (`insights-view.tsx`), et les répéter
          ici affichait deux fois les mêmes chiffres à trois centimètres d'écart. Ne reste que
          ce que les KPIs ne disent pas : la période couverte et ce à quoi elle est comparée. */}
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.weekStart
          ? `S-1 · semaine du ${frDayLong(data.weekStart)} au ${frDayLong(addDays(data.weekStart, 6))}, comparée à la semaine en cours`
          : 'Analyses hebdomadaires des quotas par chatter'}
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
