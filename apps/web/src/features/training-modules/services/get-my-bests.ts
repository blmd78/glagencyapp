import { createClient } from '@/lib/supabase/server'

export interface MyBest {
  bestTotal: number
  attempts: number
}

export interface MyBests {
  /** Meilleur total par cas (clé = `case_id`) — absent = jamais joué. */
  bests: Map<string, MyBest>
  /** Moyenne des meilleurs totaux HORS boss (0118) — pilote le verrou du boss. */
  avgTotal: number | null
}

/**
 * Les meilleurs résultats du VISITEUR, pour afficher les médailles dans un module.
 * `.eq('profile_id', …)` explicite et non « la RLS s'en charge » : la policy de
 * `training_case_bests` ouvre AUSSI la lecture au droit Suivi (encadrant) et celle de
 * `training_profile_stats` à toute la face Formation — sans ce filtre, un encadrant verrait
 * la somme de tout le monde. Vide si le visiteur n'a pas le droit Entraînement (la page ne
 * l'appelle même pas).
 */
export async function getMyBests(profileId: string): Promise<MyBests> {
  const supabase = await createClient()
  const [bests, stats] = await Promise.all([
    supabase.from('training_case_bests').select('case_id, best_total, best_objective, attempts').eq('profile_id', profileId),
    supabase.from('training_profile_stats').select('avg_total').eq('profile_id', profileId).maybeSingle(),
  ])
  if (bests.error) throw new Error(bests.error.message)
  if (stats.error) throw new Error(stats.error.message)
  return {
    bests: new Map((bests.data ?? []).map((b) => [b.case_id, { bestTotal: b.best_total, attempts: b.attempts }])),
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    avgTotal: stats.data?.avg_total == null ? null : Number(stats.data.avg_total),
  }
}
