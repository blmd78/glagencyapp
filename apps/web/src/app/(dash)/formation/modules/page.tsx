import { Suspense } from 'react'
import { hasPageAccess, requireAccess } from '@/lib/auth'
import { ModulesTemplate } from '@/features/training-modules/ModulesTemplate'
import { ModulesSkeleton } from '@/features/training-modules/components/modules-skeleton'
import { getModulesProgress, type ModulesData } from '@/features/training-modules/services/get-modules-progress'
import { SectionFallback } from '@/components/skeletons/route-loading'

/** Modules de formation — ouverts au droit Entraînement OU Suivi (miroir de `NavItem.anyOf`). */
export default async function ModulesPage() {
  const profile = await requireAccess(['frm-entrainement', 'frm-suivi'])
  // Seul un chatter qui s'entraîne a une progression : un encadrant Suivi voit le catalogue nu.
  const data = getModulesProgress(hasPageAccess(profile, 'frm-entrainement') ? profile.id : null)
  return (
    // `.gla` = thème repris de Good Luck Agency (cf. `formation-theme.css`).
    <div className="gla gla-page flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.3px]">Modules</h1>
      <Suspense fallback={<SectionFallback><ModulesSkeleton /></SectionFallback>}>
        <ModulesContent data={data} />
      </Suspense>
    </div>
  )
}

async function ModulesContent({ data }: { data: Promise<ModulesData> }) {
  return <ModulesTemplate data={await data} />
}
