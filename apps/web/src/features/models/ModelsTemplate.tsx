import { ModelsTable } from './components/models-table'
import type { ModelsData } from './types'

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

/** Template Modèles : table façon « Comparatif modèles ». Aucun fetch. */
export function ModelsTemplate({ data }: { data: ModelsData }) {
  const priv = data.models.filter((m) => m.isPrivate).length
  const total = Math.round(data.models.reduce((s, m) => s + m.total, 0))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modèles</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · {data.models.length} modèles{priv > 0 && ` (dont ${priv} privés)`} · CA
          total {eur(total)}
        </p>
      </div>

      <ModelsTable models={data.models} />
    </div>
  )
}
