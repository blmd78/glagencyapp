import { requireAccess } from '@/lib/auth'

// Placeholder « Ma formation » (droit `frm-entrainement`, home du chatter) : garantit la page
// COCHABLE dans /formation/members et l'atterrissage d'un chatter formation, tant que les
// sessions d'entraînement (moteur IA) ne sont pas construites. Les cours et cas se lisent
// déjà dans Modules.
export default async function MaFormationPage() {
  await requireAccess('frm-entrainement')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ma formation</h1>
        <p className="text-sm text-muted-foreground">Entraînement</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Ton entraînement arrive ici — en attendant, les cours et les cas sont dans Modules.
      </div>
    </div>
  )
}
