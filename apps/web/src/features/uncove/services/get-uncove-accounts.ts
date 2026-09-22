import { createClient } from '@/lib/supabase/server'
import type { CreatorOption, UncoveAccountRow, UncoveStatus } from '../types'

/** Liste des comptes pour l'écran d'administration. Lecture RLS (has_page/admin). */
export async function getUncoveAccounts(): Promise<UncoveAccountRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('uncove_accounts')
    .select('id, label, uncove_user_id, status, last_synced_at, creator_id, counts_in_ca, creators(name)')
    .order('label')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    uncoveUserId: r.uncove_user_id,
    status: r.status as UncoveStatus,
    lastSyncedAt: r.last_synced_at,
    creatorId: r.creator_id,
    creatorName: r.creators?.name ?? null,
    countsInCa: r.counts_in_ca,
  }))
}

/**
 * Modèles proposées au rattachement. Écran admin (`requireAdmin` en amont) → la RLS
 * `creators_scoped_read` rend TOUT le catalogue, y compris les doublons de plateforme
 * (« Carla », « Carla (OnlyFans) », « Carla (privé) ») : c'est justement le choix qu'on
 * demande à l'admin de faire à la main.
 */
export async function getCreatorOptions(): Promise<CreatorOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('creators').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}
