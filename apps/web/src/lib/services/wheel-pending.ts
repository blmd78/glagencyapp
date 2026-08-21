import { createClient } from '@/lib/supabase/server'

/**
 * Pastille sidebar « Roue » : 1 = ticket non utilisé OU top 3 de la semaine passée non
 * réclamé — RPC `training_wheel_pending` (0122), lecture seule. Client USER (RLS) : la
 * fonction est `security definer` mais s'auto-restreint au profil courant (ou à un lecteur
 * `frm-suivi`), donc pas besoin du client admin.
 */
export async function getWheelPending(profileId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_wheel_pending', { p_profile: profileId })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
