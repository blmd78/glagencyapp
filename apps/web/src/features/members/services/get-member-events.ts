import { isEventKind, memberEventLabel, type EventKind } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { SelectableMember } from '@/lib/types/member'
import type { MemberEvent } from '../types'

/**
 * Historique d'UN membre (onglet du dialog), ou de TOUS (flux « Activité ») quand `profileId` est
 * omis — la même lecture sert les deux questions : « qu'est-il arrivé à Mehdi ? » et « qui a bougé
 * quoi cette semaine ? ».
 *
 * DEUX CLIENTS, ET C'EST LA RÈGLE DU PROJET. Les ÉVÉNEMENTS se lisent sous RLS (client session) :
 * la policy `member_events_read` (0101) est l'enforcement réel, s'en remettre au service role
 * ferait de la garde de page le seul rempart. La RÉSOLUTION DES NOMS, elle, passe par le client
 * admin — c'est l'usage que la norme lui réserve (`lib/services/team.ts`) : un `actor_id` peut
 * pointer un profil hors du périmètre du lecteur, ou parti, et l'événement doit rester lisible.
 *
 * Résolus par map et non par jointure PostgREST, pour la même raison : `actor_id` est en
 * `on delete set null`, une jointure ferait disparaître la ligne au lieu d'afficher « système ».
 *
 * TOUT EST REMONTÉ, sans exception ni filtre (décision Benoit 2026-08-03). Les changements de
 * droits ont d'abord été masqués derrière une case, puis écartés au service : les deux ont été
 * retirés. Un historique qui décide de ce qu'il montre n'est plus un historique — c'est
 * l'exhaustivité qui fait sa valeur, et le filtrage se fait par MEMBRE et par PÉRIODE, pas par
 * nature d'événement.
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
    .select('id, created_at, kind, from_value, to_value, created_by, profile_id')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (opts.profileId) q = q.eq('profile_id', opts.profileId)
  if (opts.from) q = q.gte('created_at', `${opts.from}T00:00:00Z`)
  // Borne de fin INCLUSE : `to` est un jour, pas un instant — sans le `T23:59:59`, le dernier
  // jour de la période sélectionnée serait silencieusement exclu.
  if (opts.to) q = q.lte('created_at', `${opts.to}T23:59:59Z`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (rows.length === 0) return []

  // fetchAll : `profiles` grossit avec l'équipe (cap PostgREST 1000 silencieux).
  const { data: profiles, error: pErr } = await fetchAll((f, t) =>
    admin.from('profiles').select('id, display_name, email, role').order('id').range(f, t),
  )
  if (pErr) throw new Error(pErr.message)
  // Nom ET rôle dans la même map : la table d'activité affiche les deux, et les profils sont
  // déjà chargés — aucune requête supplémentaire.
  const byId = new Map(
    (profiles ?? []).map(
      (p) => [p.id, { name: p.display_name ?? p.email ?? '—', role: p.role }] as const,
    ),
  )

  return rows
    .filter((r) => isEventKind(r.kind))
    .map((r) => ({
      id: r.id,
      at: r.created_at,
      kind: r.kind as EventKind,
      // Rédaction dans @glagency/core (testée) : ce service ne fait que lire et assembler.
      label: memberEventLabel(r.kind as EventKind, r.from_value, r.to_value),
      actorName: r.created_by ? (byId.get(r.created_by)?.name ?? null) : null,
      memberName: byId.get(r.profile_id)?.name ?? '—',
      memberRole: byId.get(r.profile_id)?.role ?? 'chatteur',
    }))
}

/**
 * Options du sélecteur de membre de l'onglet « Activité » (`?membre=`).
 *
 * LES PARTIS SONT INCLUS, contrairement à `getVisibleProfiles` qui les écarte : ce sélecteur ne
 * sert pas à DÉSIGNER quelqu'un pour une action, il sert à RELIRE son passé — et l'historique de
 * quelqu'un qui vient de partir est précisément celui qu'on veut consulter.
 *
 * Client admin, comme la résolution des noms au-dessus : la liste doit couvrir tous les profils
 * qu'un événement peut nommer, y compris hors périmètre du lecteur. La page est déjà gardée par
 * `requireAdminOrManager`, et seuls id/nom/rôle sortent d'ici.
 */
export async function getEventMemberOptions(): Promise<SelectableMember[]> {
  const admin = createAdminClient()
  const { data, error } = await fetchAll((f, t) =>
    admin.from('profiles').select('id, display_name, email, role').order('id').range(f, t),
  )
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((p) => ({ id: p.id, name: p.display_name ?? p.email ?? '—', role: p.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
