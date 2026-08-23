import { createClient } from '@/lib/supabase/server'

export interface ModuleRankRow {
  profileId: string
  displayName: string
  /** Somme des MEILLEURS totaux du chatter sur les cas actifs du module (boss exclu). */
  points: number
  casesDone: number
  avgTotal: number | null
}

/**
 * Classement d'un module (RPC `training_module_ranking`, migration 0119).
 *
 * Pourquoi une RPC et pas une lecture : la RLS de `training_case_bests` n'ouvre les résultats qu'à
 * leur propriétaire (plus encadrant Suivi / admin) et celle de `profiles` ne laisse pas un chatter
 * lire tous les noms — un classement par module est donc impossible à reconstituer côté client.
 * La fonction est `security definer`, gardée par `is_admin() OR has_page('formation')`, et ne
 * renvoie que des noms d'affichage et des agrégats.
 *
 * Déjà trié par points décroissants côté SQL : ne pas re-trier ici, sous peine de faire diverger le
 * podium du tableau.
 */
export async function getModuleRanking(moduleId: string): Promise<ModuleRankRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_module_ranking', { p_module: moduleId })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    displayName: r.display_name,
    points: r.points,
    casesDone: r.cases_done,
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    avgTotal: r.avg_total == null ? null : Number(r.avg_total),
  }))
}
