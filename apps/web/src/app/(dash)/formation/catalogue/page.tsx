import { requireAdmin } from '@/lib/auth'

// Placeholder — route nécessaire pour les liens typés (typedRoutes). Remplacée par la
// feature Catalogue (tâches suivantes).
export default async function CataloguePage() {
  await requireAdmin()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catalogue</h1>
        <p className="text-sm text-muted-foreground">Modules, cours et cas</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Catalogue — arrive avec l’incrément Catalogue.
      </div>
    </div>
  )
}
