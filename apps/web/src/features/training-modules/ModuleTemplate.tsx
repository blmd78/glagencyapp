import { Suspense } from 'react'
import { UrlTabs } from '@/components/url-tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { CasesList } from './components/cases-list'
import { CourseView } from './components/course-view'
import { ModulePodium } from './components/module-podium'
import { ModuleRanking } from './components/module-ranking'
import type { MyBest } from './services/get-my-bests'
import type { ModuleRankRow } from './services/get-module-ranking'
import type { ModuleDetail, ModuleVue } from './types'

/**
 * Un module : le top 3 du module, puis les onglets Cours / Cas / Classement — Server Component,
 * aucun fetch.
 *
 * Le classement arrive en `Promise` NON attendue : le cours et les cas s'affichent tout de suite,
 * le podium et le tableau streament dans leurs propres boundaries quand la RPC répond. Une seule
 * promesse pour les deux — elle n'est lue qu'une fois côté serveur.
 */
export function ModuleTemplate({
  module,
  vue,
  canPlay,
  bests,
  avgTotal,
  ranking,
  myProfileId,
}: {
  module: ModuleDetail
  vue: ModuleVue
  canPlay: boolean
  /** Meilleurs résultats du visiteur par cas — vide sans droit Entraînement. */
  bests: Map<string, MyBest>
  avgTotal: number | null
  ranking: Promise<ModuleRankRow[]>
  myProfileId: string
}) {
  return (
    <div className="flex flex-col gap-6">
      {module.description && <p className="-mt-4 max-w-prose text-sm text-muted-foreground">{module.description}</p>}
      <Suspense fallback={<Skeleton className="h-[248px]" />}>
        <PodiumSection ranking={ranking} myProfileId={myProfileId} />
      </Suspense>
      <UrlTabs
        value={vue}
        defaultValue="cours"
        items={[
          { value: 'cours', label: 'Cours', content: <CourseView courseMd={module.courseMd} /> },
          {
            value: 'cas',
            label: `Cas (${module.cases.length})`,
            content: <CasesList module={module} canPlay={canPlay} bests={bests} avgTotal={avgTotal} />,
          },
          {
            value: 'classement',
            label: 'Classement',
            content: (
              <Suspense fallback={<Skeleton className="h-64" />}>
                <RankingSection ranking={ranking} myProfileId={myProfileId} />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  )
}

async function PodiumSection({ ranking, myProfileId }: { ranking: Promise<ModuleRankRow[]>; myProfileId: string }) {
  return <ModulePodium rows={await ranking} myProfileId={myProfileId} />
}

async function RankingSection({ ranking, myProfileId }: { ranking: Promise<ModuleRankRow[]>; myProfileId: string }) {
  return <ModuleRanking rows={await ranking} myProfileId={myProfileId} />
}
