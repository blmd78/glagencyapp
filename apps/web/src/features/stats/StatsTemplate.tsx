import { SubsChart } from './components/subs-chart'
import type { StatsData } from './types'

/**
 * Template Stats : statistiques par modèle (abonnés par jour). Aucun fetch.
 * `h1` remonté dans `page.tsx` (streaming) : `-mt-4` compense le double `gap-6`
 * page/Template — recette pilote (docs/guidelines-standard-feature.md §2.5).
 */
export function StatsTemplate({ data }: { data: StatsData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · courbes d&apos;abonnés par modèle
      </p>
      <SubsChart data={data} />
    </div>
  )
}
