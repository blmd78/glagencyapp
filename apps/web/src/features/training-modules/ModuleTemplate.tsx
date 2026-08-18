import { CasesList } from './components/cases-list'
import { CourseView } from './components/course-view'
import { ModuleTabs } from './components/module-tabs'
import type { MyBest } from './services/get-my-bests'
import type { ModuleDetail, ModuleVue } from './types'

/** Un module : description + onglets Cours / Cas — Server Component, aucun fetch. */
export function ModuleTemplate({
  module,
  vue,
  canPlay,
  bests,
  avgTotal,
}: {
  module: ModuleDetail
  vue: ModuleVue
  canPlay: boolean
  /** Meilleurs résultats du visiteur par cas — vide sans droit Entraînement. */
  bests: Map<string, MyBest>
  avgTotal: number | null
}) {
  return (
    <div className="flex flex-col gap-6">
      {module.description && <p className="-mt-4 max-w-prose text-sm text-muted-foreground">{module.description}</p>}
      <ModuleTabs
        vue={vue}
        casCount={module.cases.length}
        cours={<CourseView courseMd={module.courseMd} />}
        cas={<CasesList module={module} canPlay={canPlay} bests={bests} avgTotal={avgTotal} />}
      />
    </div>
  )
}
