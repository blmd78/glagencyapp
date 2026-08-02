import { isEventKind, memberEventLabel, type EventKind } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { MemberEvent } from '../types'

/**
 * Historique d'UN membre (onglet du dialog), ou de TOUS (flux « Activité ») quand `profileId` est
 * omis — la même lecture sert les deux questions : « qu'est-il arrivé à Mehdi ? » et « qui a bougé
 * quoi cette semaine ? ».
 *
 * DEUX CLIENTS, ET C'EST LA RÈGLE DU PROJET. Les ÉVÉNEMENTS se lisent sous RLS (client session) :
 * la policy `member_events_read` (0104) est l'enforcement réel, s'en remettre au service role
 * ferait de la garde de page le seul rempart. La RÉSOLUTION DES NOMS, elle, passe par le client
 * admin — c'est l'usage que la norme lui réserve (`lib/services/team.ts`) : un `actor_id` peut
 * pointer un profil hors du périmètre du lecteur, ou parti, et l'événement doit rester lisible.
 *
 * Résolus par map et non par jointure PostgREST, pour la même raison : `actor_id` est en
 * `on delete set null`, une jointure ferait disparaître la ligne au lieu d'afficher « système ».
 */
export async function getMemberEvents(opts: {
  profileId?: string
  from?: string
  to?: string
  limit?: number
}): Promise<MemberEvent[]> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const limit = opts.limit ?? 200

  let q = supabase
    .from('member_events')
    .select('id, at, kind, from_value, to_value, actor_id, profile_id')
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (opts.profileId) q = q.eq('profile_id', opts.profileId)
  if (opts.from) q = q.gte('at', `${opts.from}T00:00:00Z`)
  // Borne de fin INCLUSE : `to` est un jour, pas un instant — sans le `T23:59:59`, le dernier
  // jour de la période sélectionnée serait silencieusement exclu.
  if (opts.to) q = q.lte('at', `${opts.to}T23:59:59Z`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (rows.length === 0) return []

  // fetchAll : `profiles` grossit avec l'équipe (cap PostgREST 1000 silencieux).
  const { data: profiles, error: pErr } = await fetchAll((f, t) =>
    admin.from('profiles').select('id, display_name, email').order('id').range(f, t),
  )
  if (pErr) throw new Error(pErr.message)
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name ?? p.email ?? '—'] as const),
  )

  return rows
    .filter((r) => isEventKind(r.kind))
    .map((r) => ({
      id: r.id,
      at: r.at,
      kind: r.kind as EventKind,
      // Rédaction dans @glagency/core (testée) : ce service ne fait que lire et assembler.
      label: memberEventLabel(r.kind as EventKind, r.from_value, r.to_value),
      actorName: r.actor_id ? (nameById.get(r.actor_id) ?? null) : null,
      memberName: nameById.get(r.profile_id) ?? '—',
    }))
}
