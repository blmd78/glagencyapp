import { QuotasEditor } from './components/quotas-editor'
import { ExclusionsEditor } from './components/exclusions-editor'
import type { QuotasData } from './types'

/** Template Quotas : seuils journaliers par équipe + exclusion LTV des comptes privés. Aucun fetch. */
export function QuotasTemplate({ data }: { data: QuotasData }) {
  const configured = data.teams.filter((t) => t.quota !== null).length

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Seuils journaliers par modèle · {configured}/{data.teams.length} configurés · utilisés
        pour générer les cartes Analyses chaque semaine
      </p>

      {data.teams.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucune équipe active</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Les équipes sont créées par l&apos;ingestion quotidienne. Reviens après le prochain
            refresh, ou vérifie la table teams.
          </p>
        </div>
      ) : (
        <QuotasEditor teams={data.teams} />
      )}

      {data.accounts.length > 0 && <ExclusionsEditor accounts={data.accounts} />}
    </div>
  )
}
