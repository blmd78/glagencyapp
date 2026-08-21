import { CatalogView } from './components/catalog-view'
import type { CatalogData } from './types'

/**
 * Template Catalogue (admin) — Server Component, aucun fetch. Deux colonnes : modules à gauche,
 * module sélectionné à droite (en-tête + table des cas). Le module affiché vient de
 * `?module=<code>` ; défaut = 1ᵉʳ module. La feuille cliente `CatalogView` porte les dialogs
 * (module / cas).
 */
export function CatalogTemplate({ data, selectedCode }: { data: CatalogData; selectedCode: string | null }) {
  const selected = data.modules.find((m) => m.code === selectedCode) ?? data.modules[0] ?? null
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Modules, cours et cas d’entraînement — ce que les chatters retrouvent dans Modules.
      </p>
      <CatalogView modules={data.modules} selected={selected} />
    </div>
  )
}
