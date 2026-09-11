import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

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
 *
 * Vit en `lib/services/` et non dans `features/training-modules/` : Modules, « Ma formation » et
 * « Ma roue » en ont tous besoin pour calculer la MÊME progression, et la frontière ESLint
 * (`no-restricted-paths`) interdit à une feature d'importer une autre feature.
 *
 * `.eq('profile_id', …)` explicite et non « la RLS s'en charge » : la policy de
 * `training_case_bests` ouvre AUSSI la lecture au droit Suivi (encadrant) et celle de
 * `training_profile_stats` à toute la face Formation — sans ce filtre, un encadrant verrait
 * la somme de tout le monde. Vide si le visiteur n'a pas le droit Entraînement (la page ne
 * l'appelle même pas).
 */
export async function getMyBests(profileId: string): Promise<MyBests> {
  const supabase = await createClient()
  const [bests, stats] = await Promise.all([
    supabase.from('training_case_bests').select('case_id, best_total, attempts').eq('profile_id', profileId),
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

/**
 * La DERNIÈRE session jouée par cas, pour le visiteur — cible du lien « Voir » des listes de cas.
 *
 * SÉPARÉE de `getMyBests` À DESSEIN : celui-ci sert aussi « Ma formation » et « Ma roue », qui
 * n'affichent pas ce lien et n'ont pas à payer la lecture. Seule la page Modules l'appelle.
 *
 * Le coût est borné par l'index `training_sessions_profile_started_idx` (profile_id, started_at) :
 * 67 sessions pour le chatteur médian, 511 au 95ᵉ centile, 745 au maximum en production — trois
 * colonnes, lues une fois par rendu de module. `fetchAll` plutôt qu'une limite : une coupe
 * silencieuse priverait de leur lien les cas les plus anciens, précisément ceux qu'on revient
 * relire.
 */
export async function getMyLastSessionByCase(profileId: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data, error } = await fetchAll((f, t) =>
    supabase
      .from('training_sessions')
      .select('id, case_id, started_at')
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .range(f, t),
  )
  if (error) throw new Error(error.message)
  // Lignes déjà triées du plus récent au plus ancien : la PREMIÈRE vue pour un cas est la bonne.
  const out = new Map<string, string>()
  for (const r of data ?? []) {
    if (r.case_id && !out.has(r.case_id)) out.set(r.case_id, r.id)
  }
  return out
}
