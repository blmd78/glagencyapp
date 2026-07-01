import { ModelCard } from './components/model-card'
import { RevenueScopeNote } from '@/components/revenue-scope-note'
import type { ModelsData } from './types'

/** Template Modèles : grille de cartes par modèle. Aucun fetch. */
export function ModelsTemplate({ data }: { data: ModelsData }) {
  const priv = data.models.filter((m) => m.isPrivate).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modèles</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · {data.models.length} modèles{priv > 0 && ` (dont ${priv} privés)`}
        </p>
      </div>

      <RevenueScopeNote active="allAccounts" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.models.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </div>
    </div>
  )
}
