import { ModelCard } from './components/model-card'
import type { ModelsData } from './types'

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

/** Template Modèles : grille de cartes par modèle. Aucun fetch. */
export function ModelsTemplate({ data }: { data: ModelsData }) {
  const total = Math.round(data.models.reduce((s, m) => s + m.total, 0))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modèles</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · {data.models.length} modèles · CA total {eur(total)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.models.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </div>
    </div>
  )
}
