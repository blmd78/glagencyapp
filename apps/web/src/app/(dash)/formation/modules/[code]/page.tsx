import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { hasPageAccess, requireAccess } from '@/lib/auth'
import { getMyBests, type MyBests } from '@/lib/services/training-bests'
import { getModule, getPersona } from '@/lib/services/training-public'
import { getModuleRanking } from '@/features/training-modules/services/get-module-ranking'
import { ModuleTemplate } from '@/features/training-modules/ModuleTemplate'
import { ModuleSkeleton } from '@/features/training-modules/components/module-skeleton'
import type { ModuleDetail } from '@/features/training-modules/types'
import type { TrainingPersona } from '@/lib/types/training-public'

const NO_BESTS: MyBests = { bests: new Map(), avgTotal: null }

/**
 * Un module : classement, cours replié et exercices sur un seul écran. `?competence=<id>` ouvre les
 * exercices d'une compétence (Setting en a 6, Relationnel 4). 404 si code inconnu ou module inactif.
 */
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ competence?: string }>
}) {
  const [profile, { code }, { competence }] = await Promise.all([
    requireAccess(['frm-entrainement', 'frm-suivi']),
    params,
    searchParams,
  ])
  // « Jouer » n'appartient qu'au droit Entraînement — un encadrant Suivi seul lit les cas.
  const canPlay = hasPageAccess(profile, 'frm-entrainement')
  // Le h1 est le titre du module → il streame avec la donnée (pas de h1 immédiat séparable).
  // `modulePromise`, pas `module` : ce nom est réservé (CommonJS) — eslint(@next/next/no-assign-module-variable).
  const modulePromise = getModule(code)
  // Sans droit Entraînement, pas de progression personnelle à afficher : on n'interroge même pas.
  const bests = canPlay ? getMyBests(profile.id) : Promise.resolve(NO_BESTS)
  // Une ligne unique, sans dépendance au module : lancée en parallèle, attendue dans le contenu.
  const persona = getPersona()
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <ModuleContent
        module={modulePromise}
        bests={bests}
        canPlay={canPlay}
        myProfileId={profile.id}
        competenceId={competence ?? null}
        persona={persona}
      />
    </Suspense>
  )
}

async function ModuleContent({
  module,
  bests,
  canPlay,
  myProfileId,
  competenceId,
  persona,
}: {
  module: Promise<ModuleDetail | null>
  bests: Promise<MyBests>
  canPlay: boolean
  myProfileId: string
  competenceId: string | null
  persona: Promise<TrainingPersona | null>
}) {
  const [m, my, fiche] = await Promise.all([module, bests, persona])
  if (!m) notFound()
  // Vraie dépendance séquentielle : la RPC a besoin de l'id du module. Lancée SANS `await` — le
  // titre et les onglets s'affichent, le classement streame dans ses boundaries (`ModuleTemplate`).
  const ranking = getModuleRanking(m.id)
  return (
    // `.gla` = thème repris de Good Luck Agency (cf. `formation-theme.css`).
    <div className="gla gla-page flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-[-0.3px]">
        {m.emoji && <span aria-hidden>{m.emoji}</span>}
        {m.title}
      </h1>
      <ModuleTemplate
        module={m}
        canPlay={canPlay}
        bests={my.bests}
        avgTotal={my.avgTotal}
        ranking={ranking}
        myProfileId={myProfileId}
        competenceId={competenceId}
        persona={fiche}
      />
    </div>
  )
}
