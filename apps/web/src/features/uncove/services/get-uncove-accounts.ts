import { createClient } from '@/lib/supabase/server'
import type { UncoveAccountRow, UncoveStatus } from '../types'

/** Liste des comptes pour l'écran d'administration. Lecture RLS (has_page/admin). */
export async function getUncoveAccounts(): Promise<UncoveAccountRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('uncove_accounts' as never)
    .select('id, label, uncove_user_id, status, last_synced_at')
    .order('label')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Array<{
    id: string
    label: string
    uncove_user_id: string
    status: UncoveStatus
    last_synced_at: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    uncoveUserId: r.uncove_user_id,
    status: r.status,
    lastSyncedAt: r.last_synced_at,
  }))
}
