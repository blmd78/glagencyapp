import { requireAccess } from '@/lib/auth'

// Placeholder de la face Formation : garantit une home + une page COCHABLE (`frm-suivi`,
// droit Suivi — encadrement) dans /formation/members tant que la reprise de Good Luck Agency
// (modules, cas, notation IA) n'est pas construite. Le droit de face `formation` est posé par
// mergePages.
export default async function FormationOverviewPage() {
  await requireAccess('frm-suivi')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formation</h1>
        <p className="text-sm text-muted-foreground">Entraînement</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Overview encadrement — arrive avec les sessions d’entraînement.
      </div>
    </div>
  )
}
