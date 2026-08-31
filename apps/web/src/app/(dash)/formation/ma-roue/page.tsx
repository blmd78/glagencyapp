import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { ModuleWheelTemplate } from '@/features/training-module-wheel/ModuleWheelTemplate'
import { ModuleWheelSkeleton } from '@/features/training-module-wheel/components/module-wheel-skeleton'
import { getModuleWheel } from '@/features/training-module-wheel/services/get-module-wheel'
import type { ModuleWheelData } from '@/features/training-module-wheel/types'

/**
 * « Ma roue » — la roue des MODULES, réservée aux chatters en formation (`frm-entrainement`, les
 * admins passent partout). Le vrai verrou est la garde de `spinModuleWheel` + la RLS ; cette page
 * ne fait que refuser l'entrée.
 */
export default async function MaRouePage() {
  // `requireAccess(slug)` (lib/auth/index.ts:95) redirige si le droit manque et rend le `Profile`
  // (id, role, pages) — les admins passent partout.
  const profile = await requireAccess('frm-entrainement')
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getModuleWheel(profile.id)
  return (
    // `.gla` : même décor que la roue nº 1 — c'est le même objet, hérité de Good Luck Agency.
    <div className="gla gla-page">
      <Suspense fallback={<ModuleWheelSkeleton />}>
        <Content data={data} isAdmin={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function Content({ data, isAdmin }: { data: Promise<ModuleWheelData>; isAdmin: boolean }) {
  return <ModuleWheelTemplate data={await data} isAdmin={isAdmin} />
}
