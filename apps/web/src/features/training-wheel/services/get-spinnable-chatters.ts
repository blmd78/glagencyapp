import { createClient } from '@/lib/supabase/server'

export interface SpinnableChatter {
  profileId: string
  displayName: string
}

/**
 * Les chatteurs pour qui un encadrant peut lancer la roue : les membres en poste, rôle chatteur,
 * avec le droit Entraînement.
 *
 * Réutilise `training_overview_roster` plutôt que d'ajouter une RPC : elle sélectionne EXACTEMENT
 * cette population et porte déjà la garde `has_page('frm-suivi')` — un chatteur qui l'appellerait
 * recevrait une liste vide. On ne garde que l'identité (le reste du roster ne sert pas ici).
 *
 * Non cloisonné par modèle, comme tout le suivi de formation : qui a le droit Suivi voit toute la
 * promo (spec §7).
 */
export async function getSpinnableChatters(): Promise<SpinnableChatter[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_overview_roster')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ profileId: r.profile_id, displayName: r.display_name }))
}
