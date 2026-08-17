import { ModulesList } from './components/modules-list'
import { ModulePanel } from './components/module-panel'
import type { CatalogData } from './types'

/**
 * Template Catalogue (admin) — Server Component, aucun fetch. Deux colonnes : modules à gauche,
 * module sélectionné à droite (en-tête + table des cas). Le module affiché vient de
 * `?module=<code>` ; défaut = 1ᵉʳ module. Les dialogs (module / cas) sont montés par la feuille
 * cliente `CatalogView` à partir de la Task 8 — jusque-là ce Template compose directement.
 */
export function CatalogTemplate({ data, selectedCode }: { data: CatalogData; selectedCode: string | null }) {
  const selected = data.modules.find((m) => m.code === selectedCode) ?? data.modules[0] ?? null
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Modules, cours et cas d’entraînement — ce que les chatters retrouvent dans Modules.
      </p>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
        <ModulesList modules={data.modules} selectedId={selected?.id ?? null} />
        {selected ? (
          <ModulePanel module={selected} />
        ) : (
          <p className="text-sm text-muted-foreground">Aucun module — crée le premier.</p>
        )}
      </div>
    </div>
  )
}
