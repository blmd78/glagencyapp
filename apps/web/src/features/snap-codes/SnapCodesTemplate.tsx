import { SnapCodesView } from './components/snap-codes-view'
import type { SnapCodesData } from './types'

/**
 * Codes Snap (porté de gla-workflow) : identifiants Snapchat par modèle, édition inline
 * avec autosave (debounce 500 ms + save au blur), mots de passe masqués par défaut,
 * filtre par modèle. Une ligne par modèle actif — la ligne se crée à la première édition.
 * `h1` remonté dans `page.tsx` (kickoff sans await + Suspense, recette pilote) — sous-titre
 * en `-mt-4` pour compenser le double `gap-6` page/Template (docs/guidelines-standard-feature.md §2.5).
 */
export function SnapCodesTemplate({ data, canWrite }: { data: SnapCodesData; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Identifiants Snapchat par modèle (1 par modèle)
        {canWrite ? ' — édition directe, sauvegarde automatique' : ' — lecture seule'}
      </p>

      <SnapCodesView data={data} canWrite={canWrite} />
    </div>
  )
}
