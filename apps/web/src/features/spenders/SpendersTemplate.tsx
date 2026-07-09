import { KpiCard, type Kpi } from '@/components/kpi-card'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { eur } from '@/lib/format'
import { SpendersTable } from './components/spenders-table'
import { SpendersDailyChart } from './components/spenders-daily-chart'
import { isARelancer, RELANCE_SEUIL_JOURS, type SpendersData } from './types'

/** Template Spenders (CRM closing) : KPI + évolution + table. Aucun fetch. Pas de période. */
export function SpendersTemplate({ data }: { data: SpendersData }) {
  const freshness = data.capturedAt
    ? new Date(data.capturedAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const caTotal = data.spenders.reduce((s, x) => s + x.ca, 0)
  const caCapte = data.daily.reduce((s, d) => s + d.ca, 0)
  const aRelancer = data.spenders.filter(isARelancer).length
  const aRepondre = data.spenders.filter((s) => s.lastMessageIsMine === false).length
  const orphelins = data.spenders.filter((s) => !s.chatterName && !s.assignedLabel).length

  const kpis: Array<Kpi & { accent?: string }> = [
    {
      key: 'spenders',
      label: 'Spenders trackés',
      value: `${data.spenders.length} · ${eur(caTotal)}`,
      deltaPct: null,
      trendLabel: `CA ≥ ${data.threshold} € (total vie MyPuls)`,
      hint: freshness ? `scrapé le ${freshness}` : '',
      info: 'Fans dont le CA net vie connu de MyPuls dépasse le seuil de tracking, et leur CA cumulé.',
    },
    {
      key: 'capte',
      label: 'CA capté (depuis le suivi)',
      value: eur(caCapte),
      deltaPct: null,
      trendLabel: 'somme de nos jours scrapés',
      hint: 'cf. graphe d’évolution',
      info: 'Somme de toutes les transactions captées depuis le début du scrape. Ce que les spenders ont réellement dépensé pendant qu’on les suit.',
    },
    {
      key: 'relancer',
      label: 'À relancer',
      value: String(aRelancer),
      deltaPct: null,
      trendLabel: `muets depuis ≥ ${RELANCE_SEUIL_JOURS} j`,
      hint: 'dernier message de nous, sans réponse',
      accent: 'border-t-amber-500',
      info: 'Conversations où le dernier message vient de nous et date de 15 jours ou plus — la file de relance Snap.',
    },
    {
      key: 'orphelins',
      label: 'Non assignés',
      value: String(orphelins),
      deltaPct: null,
      trendLabel: `${aRepondre} en attente de réponse`,
      hint: 'sans chatteur assigné dans MyPuls',
      accent: 'border-t-red-500',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Spenders</h1>
        <p className="text-sm text-muted-foreground">
          {data.spenders.length} fan(s) à ≥ {data.threshold} € (CA net MyPuls)
          {freshness && ` · données scrapées le ${freshness}`}
        </p>
      </div>

      {data.spenders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucun spender détecté</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Les spenders apparaissent après le passage du scrapper (conversations MyPuls à CA ≥{' '}
            {data.threshold} €) sur les modèles qui te sont assignées.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ accent, ...k }) => (
              <KpiCard key={k.key} kpi={k} accent={accent} />
            ))}
          </div>

          {data.daily.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Évolution du CA spenders</CardTitle>
                <CardDescription>CA net capté par jour, depuis le début du scrape</CardDescription>
              </CardHeader>
              <CardContent>
                <SpendersDailyChart data={data.daily} />
              </CardContent>
            </Card>
          )}

          <SpendersTable spenders={data.spenders} />
        </>
      )}
    </div>
  )
}
