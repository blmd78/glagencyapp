import { SnapCodesView } from './components/snap-codes-view'
import type { SnapCodesData } from './types'

/**
 * Codes Snap (porté de gla-workflow) : identifiants Snapchat par modèle, édition inline
 * avec autosave (debounce 500 ms + save au blur), mots de passe masqués par défaut,
 * filtre par modèle. Une ligne par modèle actif — la ligne se crée à la première édition.
 */
export function SnapCodesTemplate({ data }: { data: SnapCodesData }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Codes Snap</h1>
        <p className="text-sm text-muted-foreground">
          Identifiants Snapchat par modèle (1 par modèle) — édition directe, sauvegarde automatique
        </p>
      </div>

      <SnapCodesView data={data} />
    </div>
  )
}
