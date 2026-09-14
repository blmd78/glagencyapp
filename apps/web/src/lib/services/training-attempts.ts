import { createClient } from '@/lib/supabase/server'

export interface CaseAttempts {
  /** Sessions terminées sur l'exercice (hors reprise GLA) — cf. `training_attempts`, 0161. */
  used: number
  /** Essais redonnés par l'encadrement. */
  granted: number
}

/**
 * Essais consommés et redonnés, par exercice, pour un chatteur (`training_attempts`, 0161).
 *
 * Vit en `lib/services/` : la page Modules (côté chatteur) et la fiche de l'Overview (côté
 * encadrant) lisent la même chose, et la frontière ESLint interdit à une feature d'en importer une
 * autre. Client UTILISATEUR : la fonction est `security invoker`, elle ne rend que ce que l'appelant
 * a le droit de lire (ses propres sessions, ou celles d'un chatteur pour le droit Suivi).
 */
export async function getAttempts(profileId: string): Promise<Map<string, CaseAttempts>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_attempts', { p_profile: profileId })
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((r) => [r.case_id, { used: r.used, granted: r.granted }]))
}
