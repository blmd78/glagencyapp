import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

/**
 * Spenders = conversations scrapées à CA ≥ seuil (état courant), enrichies du CA sur la
 * période du datepicker (RPC `crm_spenders_period_ca`, agrégé EN BASE — plafond CPU
 * Workers). Cloisonnement par modèle : RLS (`crm-spenders` + profile_creators).
 */
export async function getSpenders(period: Period): Promise<SpendersData> {
  const supabase = await createClient()

  // Chatteur résolu chez nous à l'ingestion (assigned_chatter_id, via chatter_alias/nom) :
  // join direct sur chatters pour le nom + l'équipe. Le label MyPuls brut reste en fallback.
  const [{ data: convs, error }, { data: periodCa, error: rpcError }] = await Promise.all([
    supabase
      .from('spender_conversations')
      .select('fan_id, username, creator_id, ca_total, status, last_message_at, last_message_is_mine, has_unread, assigned_label, assigned_chatter_id, captured_at, creators(name), chatters(display_name, team)')
      .gte('ca_total', CA_TRACKING_SEUIL)
      .order('ca_total', { ascending: false }),
    supabase.rpc('crm_spenders_period_ca', { p_from: period.from, p_to: period.to }),
  ])
  if (error) throw new Error(error.message)
  if (rpcError) throw new Error(rpcError.message)

  const caPeriodeByFan = new Map(
    (periodCa ?? []).map((r) => [`${r.creator_id}:${r.fan_id}`, r.ca] as const),
  )

  const spenders: SpenderRow[] = (convs ?? []).map((c) => {
    const chatter = c.chatters as { display_name: string; team: string | null } | null
    return {
      fanId: c.fan_id,
      username: c.username,
      creatorId: c.creator_id,
      model: (c.creators as { name: string } | null)?.name ?? '—',
      ca: c.ca_total,
      caPeriode: caPeriodeByFan.get(`${c.creator_id}:${c.fan_id}`) ?? 0,
      status: c.status,
      lastMessageAt: c.last_message_at,
      lastMessageIsMine: c.last_message_is_mine,
      hasUnread: c.has_unread,
      assignedLabel: c.assigned_label,
      chatterName: chatter?.display_name ?? null,
      chatterTeam: chatter?.team === 'rouge' || chatter?.team === 'bleue' ? chatter.team : null,
    }
  })

  return {
    spenders,
    capturedAt: convs?.[0]?.captured_at ?? null,
    threshold: CA_TRACKING_SEUIL,
    period: period.label,
  }
}
