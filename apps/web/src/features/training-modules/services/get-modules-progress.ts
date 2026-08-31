import { moduleProgress, type ModuleProgress } from '@glagency/core'
import { getMyBests } from '@/lib/services/training-bests'
import { getAllCases, getModules } from '@/lib/services/training-public'
import type { ModuleSummary } from '../types'

export interface ModuleCard extends ModuleSummary {
  /** Progression du VISITEUR sur ce module. Tout à zéro s'il n'a pas le droit Entraînement. */
  progress: ModuleProgress
}

export interface ModulesData {
  modules: ModuleCard[]
  /** Progression tous modules confondus, boss exclu — l'en-tête de la page. */
  overall: ModuleProgress
  /** Le visiteur s'entraîne-t-il ? Un encadrant Suivi seul n'a pas de progression à montrer. */
  showProgress: boolean
}

/**
 * Le catalogue AVEC la progression du visiteur — la liste des modules sans elle ne dit ni où on en
 * est, ni où reprendre. Trois lectures en parallèle : les modules, les cas actifs, les meilleurs
 * résultats.
 *
 * `profileId` à `null` pour un encadrant Suivi qui ne s'entraîne pas : on sert alors le catalogue
 * nu, sans barres à zéro qui laisseraient croire qu'il a tout raté.
 *
 * Le boss est exclu partout (comme dans « Ma formation ») : il se joue à part et ne compte dans la
 * progression d'aucun module.
 */
export async function getModulesProgress(profileId: string | null): Promise<ModulesData> {
  const [modules, allCases, mine] = await Promise.all([
    getModules(),
    getAllCases(),
    profileId ? getMyBests(profileId) : Promise.resolve(null),
  ])
  const bests = mine?.bests ?? new Map()
  const nonBoss = allCases.filter((c) => c.kind !== 'boss')

  return {
    modules: modules.map((m) => ({
      ...m,
      progress: moduleProgress(nonBoss.filter((c) => c.moduleId === m.id), bests),
    })),
    overall: moduleProgress(nonBoss, bests),
    showProgress: profileId != null,
  }
}
