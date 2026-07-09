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

  const [{ data: convs, error }, { data: chatters }, { data: periodCa, error: rpcError }] =
    await Promise.all([
      supabase
        .from('spender_conversations')
        .select('fan_id, username, creator_id, ca_total, status, last_message_at, last_message_is_mine, has_unread, assigned_mypuls_user_id, assigned_label, captured_at, creators(name)')
        .gte('ca_total', CA_TRACKING_SEUIL)
        .order('ca_total', { ascending: false }),
      supabase.from('chatters').select('display_name, mypuls_user_id, team'),
      supabase.rpc('crm_spenders_period_ca', { p_from: period.from, p_to: period.to }),
    ])
  if (error) throw new Error(error.message)
  if (rpcError) throw new Error(rpcError.message)

  const chatterByMypulsId = new Map(
    (chatters ?? [])
      .filter((c) => c.mypuls_user_id)
      .map((c) => [c.mypuls_user_id as string, { name: c.display_name, team: c.team }]),
  )
  const caPeriodeByFan = new Map(
    (periodCa ?? []).map((r) => [`${r.creator_id}:${r.fan_id}`, r.ca] as const),
  )

  const spenders: SpenderRow[] = (convs ?? []).map((c) => {
    const chatter = c.assigned_mypuls_user_id
      ? chatterByMypulsId.get(c.assigned_mypuls_user_id)
      : undefined
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
      chatterName: chatter?.name ?? null,
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
