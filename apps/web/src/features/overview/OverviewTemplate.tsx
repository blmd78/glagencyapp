import { SectionCards } from './components/section-cards'
import { ModelRanking, type RankItem } from './components/model-ranking'
import { InsightCard } from './components/insight-card'
import type { OverviewData } from './types'

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`
const int = (n: number) => n.toLocaleString('fr-FR')
const pct = (n: number) => `${n.toLocaleString('fr-FR')} %`

/**
 * Template de la feature Overview : compose les composants à partir des données
 * reçues en props. Aucun fetch ici (convention app → feature(template) → composants).
 */
export function OverviewTemplate({ data }: { data: OverviewData }) {
  const caItems: RankItem[] = data.caByModel.map((m) => ({
    name: m.name,
    value: m.ca,
    sub: `${eur(m.ca)} · ${pct(m.part)}`,
    isPrivate: m.isPrivate,
  }))
  const subItems: RankItem[] = data.subsByModel.map((m) => ({
    name: m.name,
    value: m.subs,
    sub: int(m.subs),
    isPrivate: m.name.includes('(privé)'),
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {data.periodLabel} · vue d'ensemble de l'agence
        </p>
      </div>

      <SectionCards kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ModelRanking title="CA par modèle" description="Part du CA total du mois" items={caItems} />
        <ModelRanking
          title="Nouveaux abonnés"
          description="Acquisition par modèle"
          items={subItems}
        />
      </div>

      {data.insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Points d'attention</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
