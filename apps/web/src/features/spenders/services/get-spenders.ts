import { createClient } from '@/lib/supabase/server'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

const asTeam = (t: string | null): 'rouge' | 'bleue' | null =>
  t === 'rouge' || t === 'bleue' ? t : null

/**
 * Spenders + état du tracker relances, via le RPC `crm_spenders_tracker` (join scrape ⋈
 * relances ⋈ spender_crm, agrégé EN BASE — plafond CPU Workers). Pas de datepicker : on
 * prend tout ce qu'on scrape. Cloisonnement par modèle : RLS (le RPC est SECURITY INVOKER).
 */
export async function getSpenders(): Promise<SpendersData> {
  const supabase = await createClient()

  const [{ data: rows, error }, { data: freshRow }] = await Promise.all([
    supabase.rpc('crm_spenders_tracker', { p_seuil: CA_TRACKING_SEUIL }),
    supabase
      .from('spender_conversations')
      .select('captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (error) throw new Error(error.message)

  const spenders: SpenderRow[] = (rows ?? [])
    .map((r) => ({
      fanId: r.fan_id,
      username: r.username,
      creatorId: r.creator_id,
      model: r.model ?? '—',
      ca: r.ca_total,
      status: r.status,
      lastMessageAt: r.last_message_at,
      lastMessageIsMine: r.last_message_is_mine,
      hasUnread: r.has_unread,
      assignedLabel: r.assigned_label,
      chatterId: r.assigned_chatter_id,
      chatterName: r.chatter_name,
      chatterTeam: asTeam(r.chatter_team),
      compteurR: r.compteur_r,
      derniereRelanceAt: r.derniere_relance_at,
      grise: r.relance_today,
      conversionPending: r.conversion_pending,
      archived: r.archived,
    }))
    .sort((a, b) => b.ca - a.ca)

  return {
    spenders,
    capturedAt: freshRow?.captured_at ?? null,
    threshold: CA_TRACKING_SEUIL,
  }
}
