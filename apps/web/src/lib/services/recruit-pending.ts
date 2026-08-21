import { createClient } from '@/lib/supabase/server'

/**
 * Pastille sidebar « Recrutement » : nombre de dossiers candidats au statut `nouveau` —
 * RPC `recruit_pending_count` (0125), lecture seule.
 *
 * Client USER (RLS) et SURTOUT PAS le service-role : la fonction est `security definer` mais
 * s'auto-restreint dans son corps (`is_admin()` vrai → le compte, sinon 0) et n'est exécutable
 * que par `authenticated`. Sous service-role `auth.uid()` est nul, donc `is_admin()` faux : elle
 * renverrait 0 pour tout le monde. Le gate applicatif (admin) reste posé par l'appelant
 * (`app/(dash)/layout.tsx`) pour ne pas payer l'aller-retour à chaque page d'un non-admin.
 */
export async function getRecruitPending(): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('recruit_pending_count')
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
