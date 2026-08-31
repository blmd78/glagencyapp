import { createClient } from '@/lib/supabase/server'

/**
 * Pastille sidebar « Ma roue » : nombre de tours de roue de module en attente — RPC
 * `training_module_wheel_pending` (0136), lecture seule.
 *
 * Client USER (RLS) et SURTOUT PAS le service-role : la fonction est `security definer` mais
 * s'auto-restreint dans son corps (`p_profile = auth.uid()` ou `has_page('frm-suivi')`). Sous
 * service-role `auth.uid()` est nul : elle renverrait 0 pour tout le monde. Même piège que
 * `getRecruitPending`.
 */
export async function getModuleWheelPending(profileId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_module_wheel_pending', { p_profile: profileId })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
