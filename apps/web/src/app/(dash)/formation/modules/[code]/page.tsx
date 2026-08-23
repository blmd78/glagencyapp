import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { hasPageAccess, requireAccess } from '@/lib/auth'
import { getModule } from '@/lib/services/training-public'
import { getModuleRanking } from '@/features/training-modules/services/get-module-ranking'
import { getMyBests, type MyBests } from '@/features/training-modules/services/get-my-bests'
import { ModuleTemplate } from '@/features/training-modules/ModuleTemplate'
import { ModuleSkeleton } from '@/features/training-modules/components/module-skeleton'
import type { ModuleDetail, ModuleVue } from '@/features/training-modules/types'

const NO_BESTS: MyBests = { bests: new Map(), avgTotal: null }

/** Un module : cours + cas + classement. `?vue=cas|classement` ; 404 si code inconnu ou module inactif. */
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
  // Sans droit Entraînement, pas de progression personnelle à afficher : on n'interroge même pas.
  const bests = canPlay ? getMyBests(profile.id) : Promise.resolve(NO_BESTS)
  const vues: ModuleVue[] = ['cours', 'cas', 'classement']
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <ModuleContent
        module={modulePromise}
        bests={bests}
        vue={vues.find((v) => v === vue) ?? 'cours'}
        canPlay={canPlay}
        myProfileId={profile.id}
      />
    </Suspense>
  )
}

async function ModuleContent({
  module,
  bests,
  vue,
  canPlay,
  myProfileId,
}: {
  module: Promise<ModuleDetail | null>
  bests: Promise<MyBests>
  vue: ModuleVue
  canPlay: boolean
  myProfileId: string
}) {
  const [m, my] = await Promise.all([module, bests])
  if (!m) notFound()
  // Vraie dépendance séquentielle : la RPC a besoin de l'id du module. Lancée SANS `await` — le
  // titre et les onglets s'affichent, le classement streame dans ses boundaries (`ModuleTemplate`).
  const ranking = getModuleRanking(m.id)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {m.emoji && <span aria-hidden>{m.emoji}</span>}
        {m.title}
      </h1>
      <ModuleTemplate
        module={m}
        vue={vue}
        canPlay={canPlay}
        bests={my.bests}
        avgTotal={my.avgTotal}
        ranking={ranking}
        myProfileId={myProfileId}
      />
    </div>
  )
}
