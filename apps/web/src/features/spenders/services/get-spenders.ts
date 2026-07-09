import { createClient } from '@/lib/supabase/server'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

/**
 * Spenders = conversations scrapées à CA ≥ seuil (état courant), + l'évolution du CA capté
 * par jour (graphe). Pas de datepicker : la page prend TOUT ce qu'on scrape. Le « CA total »
 * est le total vie du fan connu de MyPuls (ca_total) ; l'évolution vient de nos transactions
 * datées (depuis le début du scrape). Cloisonnement par modèle : RLS.
 */
export async function getSpenders(): Promise<SpendersData> {
  const supabase = await createClient()

  const [{ data: convs, error }, { data: daily, error: rpcError }] = await Promise.all([
    supabase
      .from('spender_conversations')
      .select('fan_id, username, creator_id, ca_total, status, last_message_at, last_message_is_mine, has_unread, assigned_label, assigned_chatter_id, captured_at, creators(name), chatters(display_name, team)')
      .gte('ca_total', CA_TRACKING_SEUIL)
      .order('ca_total', { ascending: false }),
    supabase.rpc('crm_spenders_daily'),
  ])
  if (error) throw new Error(error.message)
  if (rpcError) throw new Error(rpcError.message)

  const spenders: SpenderRow[] = (convs ?? []).map((c) => {
    const chatter = c.chatters as { display_name: string; team: string | null } | null
    return {
      fanId: c.fan_id,
      username: c.username,
      creatorId: c.creator_id,
      model: (c.creators as { name: string } | null)?.name ?? '—',
      ca: c.ca_total,
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
    daily: (daily ?? []).map((d) => ({ date: d.date, ca: Number(d.ca) })),
  }
}
