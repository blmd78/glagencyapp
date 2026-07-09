import { SpendersTable } from './components/spenders-table'
import type { SpendersData } from './types'

/** Template Spenders (CRM closing) : compose la table depuis les données scrapées. Aucun fetch. */
export function SpendersTemplate({ data }: { data: SpendersData }) {
  const freshness = data.capturedAt
    ? new Date(data.capturedAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

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
        <SpendersTable spenders={data.spenders} />
      )}
    </div>
  )
}
