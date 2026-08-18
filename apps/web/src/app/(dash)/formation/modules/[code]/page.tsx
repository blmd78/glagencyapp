import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { hasPageAccess, requireAccess } from '@/lib/auth'
import { getModule } from '@/features/training-modules/services/get-module'
import { ModuleTemplate } from '@/features/training-modules/ModuleTemplate'
import { ModuleSkeleton } from '@/features/training-modules/components/module-skeleton'
import type { ModuleDetail, ModuleVue } from '@/features/training-modules/types'

/** Un module : cours + cas. `?vue=cas` ; 404 si code inconnu ou module inactif. */
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ vue?: string }>
}) {
  const [profile, { code }, { vue }] = await Promise.all([requireAccess(['frm-entrainement', 'frm-suivi']), params, searchParams])
  // « Jouer » n'appartient qu'au droit Entraînement — un encadrant Suivi seul lit les cas.
  const canPlay = hasPageAccess(profile, 'frm-entrainement')
  // Le h1 est le titre du module → il streame avec la donnée (pas de h1 immédiat séparable).
  // `modulePromise`, pas `module` : ce nom est réservé (CommonJS) — eslint(@next/next/no-assign-module-variable).
  const modulePromise = getModule(code)
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <ModuleContent module={modulePromise} vue={vue === 'cas' ? 'cas' : 'cours'} canPlay={canPlay} />
    </Suspense>
  )
}

async function ModuleContent({ module, vue, canPlay }: { module: Promise<ModuleDetail | null>; vue: ModuleVue; canPlay: boolean }) {
  const m = await module
  if (!m) notFound()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {m.emoji && <span aria-hidden>{m.emoji}</span>}
        {m.title}
      </h1>
      <ModuleTemplate module={m} vue={vue} canPlay={canPlay} />
    </div>
  )
}
