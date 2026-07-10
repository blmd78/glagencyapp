import { KpiCard, type Kpi } from '@/components/kpi-card'
import { eur } from '@/lib/format'
import { SpendersTabs } from './components/spenders-tabs'
import { isARelancer, R_ALERTE, type SpendersData } from './types'

/** Template Spenders (CRM closing) : KPI + onglets (Liste / Tracker / Alertes R10 / Archive). */
export function SpendersTemplate({ data }: { data: SpendersData }) {
  const freshness = data.capturedAt
    ? new Date(data.capturedAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const actifs = data.spenders.filter((s) => !s.archived)
  const caTotal = actifs.reduce((s, x) => s + x.ca, 0)
  const aRelancer = actifs.filter(isARelancer).length
  const alertesR10 = actifs.filter((s) => s.compteurR >= R_ALERTE).length
  const orphelins = actifs.filter((s) => !s.chatterName && !s.assignedLabel).length

  const kpis: Array<Kpi & { accent?: string }> = [
    {
      key: 'spenders',
      label: 'Spenders trackés',
      value: String(actifs.length),
      deltaPct: null,
      trendLabel: `CA ≥ ${data.threshold} € net MyPuls`,
      hint: freshness ? `scrapé le ${freshness}` : '',
    },
    {
      key: 'ca',
      label: 'CA cumulé spenders',
      value: eur(caTotal),
      deltaPct: null,
      trendLabel: 'total vie de chaque fan',
      hint: 'somme des CA affichés',
      info: 'Somme des CA vie de tous les spenders actifs (chacun = tout son historique MyPuls). Repère de volume, pas un CA de période.',
    },
    {
      key: 'relancer',
      label: 'À relancer',
      value: String(aRelancer),
      deltaPct: null,
      trendLabel: 'muets, non relancés aujourd’hui',
      hint: 'dernier message de nous',
      accent: 'border-t-amber-500',
    },
    {
      key: 'alertes',
      label: `Alertes R${R_ALERTE}`,
      value: String(alertesR10),
      deltaPct: null,
      trendLabel: 'fin de cycle — à archiver',
      hint: `${orphelins} non assigné(s)`,
      accent: 'border-t-red-500',
      info: `Spenders relancés ${R_ALERTE} fois sans reconversion — à archiver ou à traiter en dernier recours.`,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Spenders</h1>
        <p className="text-sm text-muted-foreground">
          {actifs.length} fan(s) à ≥ {data.threshold} € (CA net MyPuls)
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
          <SpendersTabs spenders={data.spenders} />
        </>
      )}
    </div>
  )
}
