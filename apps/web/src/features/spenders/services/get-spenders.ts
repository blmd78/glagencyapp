import { createClient } from '@/lib/supabase/server'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

/**
 * Spenders = conversations scrapées à CA ≥ seuil, triées par CA. Le filtre est fait EN BASE
 * (~750 lignes remontées, pas 16k — plafond CPU Workers). Cloisonnement par modèle : RLS
 * (`crm-spenders` + profile_creators), rien à refaire ici.
 */
export async function getSpenders(): Promise<SpendersData> {
  const supabase = await createClient()

  const [{ data: convs, error }, { data: chatters }] = await Promise.all([
    supabase
      .from('spender_conversations')
      .select('fan_id, username, creator_id, ca_total, status, last_message_at, last_message_is_mine, has_unread, assigned_mypuls_user_id, assigned_label, captured_at, creators(name)')
      .gte('ca_total', CA_TRACKING_SEUIL)
      .order('ca_total', { ascending: false }),
    supabase.from('chatters').select('display_name, mypuls_user_id, team'),
  ])
  if (error) throw new Error(error.message)

  const chatterByMypulsId = new Map(
    (chatters ?? [])
      .filter((c) => c.mypuls_user_id)
      .map((c) => [c.mypuls_user_id as string, { name: c.display_name, team: c.team }]),
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
  }
}
