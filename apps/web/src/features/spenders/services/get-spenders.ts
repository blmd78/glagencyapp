import { createClient } from '@/lib/supabase/server'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

/**
 * Spenders = conversations scrapées à CA ≥ seuil (état courant). Pas de datepicker : la page
 * prend TOUT ce qu'on scrape. Le « CA total » est le total vie du fan connu de MyPuls
 * (ca_total). Cloisonnement par modèle : RLS.
 */
export async function getSpenders(): Promise<SpendersData> {
  const supabase = await createClient()

  const { data: convs, error } = await supabase
    .from('spender_conversations')
    .select('fan_id, username, creator_id, ca_total, status, last_message_at, last_message_is_mine, has_unread, assigned_label, assigned_chatter_id, captured_at, creators(name), chatters(display_name, team)')
    .gte('ca_total', CA_TRACKING_SEUIL)
    .order('ca_total', { ascending: false })
  if (error) throw new Error(error.message)

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
  }
}
