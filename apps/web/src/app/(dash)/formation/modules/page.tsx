import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { getModules } from '@/lib/services/training-public'
import { ModulesTemplate } from '@/features/training-modules/ModulesTemplate'
import { ModulesSkeleton } from '@/features/training-modules/components/modules-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { ModuleSummary } from '@/features/training-modules/types'

/** Modules de formation — ouverts au droit Entraînement OU Suivi (miroir de `NavItem.anyOf`). */
export default async function ModulesPage() {
  await requireAccess(['frm-entrainement', 'frm-suivi'])
  const modules = getModules()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
      <Suspense fallback={<SectionFallback><ModulesSkeleton /></SectionFallback>}>
        <ModulesContent modules={modules} />
      </Suspense>
    </div>
  )
}

async function ModulesContent({ modules }: { modules: Promise<ModuleSummary[]> }) {
  return <ModulesTemplate modules={await modules} />
}
