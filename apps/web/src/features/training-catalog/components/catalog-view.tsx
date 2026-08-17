'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { ModulesList } from './modules-list'
import { ModulePanel } from './module-panel'
import { ModuleDialog } from './module-dialog'
import type { CatalogModule } from '../types'

/**
 * Feuille cliente du Catalogue : porte l'état des dialogs (module en cours d'édition — et cas,
 * Task 9). Le Template reste un Server Component (guidelines-data-loading §3).
 */
export function CatalogView({ modules, selected }: { modules: CatalogModule[]; selected: CatalogModule | null }) {
  const router = useRouter()
  const [moduleDialog, setModuleDialog] = useState<{ open: boolean; module: CatalogModule | null }>({ open: false, module: null })

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
      <ModulesList
        modules={modules}
        selectedId={selected?.id ?? null}
        onCreate={() => setModuleDialog({ open: true, module: null })}
      />
      {selected ? (
        <ModulePanel module={selected} onEdit={() => setModuleDialog({ open: true, module: selected })} />
      ) : (
        <p className="text-sm text-muted-foreground">Aucun module — crée le premier.</p>
      )}
      <ModuleDialog
        open={moduleDialog.open}
        module={moduleDialog.module}
        onClose={() => setModuleDialog((d) => ({ ...d, open: false }))}
        // Route construite dynamiquement → cast Route (typedRoutes), comme members-tabs.tsx.
        onCreated={(code) => router.replace(`/formation/catalogue?module=${code}` as Route)}
      />
    </div>
  )
}
