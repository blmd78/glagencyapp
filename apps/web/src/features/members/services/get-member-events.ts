import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { DEPARTURE_LABEL, EVENT_KINDS, type DepartureReason, type EventKind, type MemberEvent } from '../types'

const SHIFT_LABEL: Record<string, string> = { matin: 'Matin', aprem: 'Après-midi', soir: 'Soir' }
const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Propriétaire',
  admin: 'Admin',
  manager: 'Manager',
  'sous-manager': 'Sous-manager',
  police: 'Police',
  chatteur: 'Chatteur',
}

const isKind = (v: string): v is EventKind => (EVENT_KINDS as readonly string[]).includes(v)
const pretty = (dict: Record<string, string>, v: string | null) => (v ? (dict[v] ?? v) : null)

/**
 * RÉDACTION DE LA PHRASE, une seule fois et côté serveur — la fiche membre et le flux global la
 * lisent telle quelle. La mettre dans les composants la dupliquerait en deux exemplaires qui
 * divergeraient au premier ajout de `kind`.
 *
 * Une flèche `a → b` quand les deux bornes existent ; sinon la formulation dit l'ajout ou le
 * retrait, parce que « Modèle : → Emma » ne se lit pas.
 */
function labelOf(kind: EventKind, from: string | null, to: string | null): string {
  const arrow = (label: string, f: string | null, t: string | null) =>
    f && t ? `${label} : ${f} → ${t}` : t ? `${label} : ${t}` : `${label} retiré${f ? ` (${f})` : ''}`

  switch (kind) {
    case 'creation':
      return `Compte créé${to ? ` (${pretty(ROLE_LABEL, to)})` : ''}`
    case 'role':
      return arrow('Rôle', pretty(ROLE_LABEL, from), pretty(ROLE_LABEL, to))
    case 'shift':
      return arrow('Shift', pretty(SHIFT_LABEL, from), pretty(SHIFT_LABEL, to))
    case 'closing':
      return arrow('Closing', from, to)
    // Les deux sens sont des faits distincts et se lisent mieux nommés qu'avec une flèche vide.
    case 'modele':
      return to ? `Modèle ${to} ajouté` : `Modèle ${from} retiré`
    case 'manager':
      return arrow('Rattachement', from, to)
    case 'pages':
      return `Droits modifiés (${from ?? '0'} → ${to ?? '0'} pages)`
    case 'nouveau':
      return to === 'true' ? 'Marqué nouvel arrivant' : 'Drapeau « nouvel arrivant » retiré'
    case 'arrivee':
      return to ? `Date d’arrivée : ${fr(to)}` : 'Date d’arrivée effacée'
    case 'sortie': {
      if (!to) return 'Départ annulé (réactivé)'
      // `to` = '2026-08-15 (vire)', composé par le trigger. Parsé par REGEX et non par index :
      // un `slice(12, -1)` produirait un libellé faux et silencieux au moindre changement de
      // format côté SQL. Si la forme ne correspond pas, on affiche la valeur BRUTE — visiblement
      // imparfaite, mais jamais trompeuse.
      const m = /^(\d{4}-\d{2}-\d{2})(?:\s+\((.+)\))?$/.exec(to)
      if (!m) return `Départ : ${to}`
      const motif = m[2] ? (DEPARTURE_LABEL[m[2] as DepartureReason] ?? m[2]) : null
      return `Départ le ${fr(m[1])}${motif ? ` — ${motif}` : ''}`
    }
  }
}

/** '2026-07-30' → '30/07/2026'. */
const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

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
    .filter((r) => isKind(r.kind))
    .map((r) => ({
      id: r.id,
      at: r.at,
      kind: r.kind as EventKind,
      label: labelOf(r.kind as EventKind, r.from_value, r.to_value),
      actorName: r.actor_id ? (nameById.get(r.actor_id) ?? null) : null,
      memberName: nameById.get(r.profile_id) ?? '—',
    }))
}
