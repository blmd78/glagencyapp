import { requireAccess } from '@/lib/auth'

// Placeholder — route nécessaire pour les liens typés (typedRoutes). Remplacée par la
// feature Catalogue (tâches suivantes).
export default async function ModulesPage() {
  await requireAccess(['frm-entrainement', 'frm-suivi'])
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
        <p className="text-sm text-muted-foreground">Cours et cas d’entraînement</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Modules — arrive avec l’incrément Catalogue.
      </div>
    </div>
  )
}
