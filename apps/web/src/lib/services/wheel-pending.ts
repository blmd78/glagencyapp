import { WHEEL_TOP_N } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'

/**
 * Pastille sidebar « Roue » : NOMBRE de tours en attente — tickets non utilisés (ils s'accumulent
 * depuis 0118) + éligibilités non encore matérialisées sur la fenêtre de rattrapage. `WHEEL_TOP_N`
 * est passé à la RPC : une seule source pour le seuil, côté domaine. Lecture seule. Client USER (RLS) : la
 * fonction est `security definer` mais s'auto-restreint au profil courant (ou à un lecteur
 * `frm-suivi`), donc pas besoin du client admin.
 */
export async function getWheelPending(profileId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_wheel_pending', { p_profile: profileId, p_top: WHEEL_TOP_N })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
