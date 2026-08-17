import { addDays, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import { getCreatorScope } from '@/lib/services/creator-scope'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { ERROR_LABEL } from '@/lib/types/police-errors'
import type { PoliceData, PoliceEntry } from '../types'

/**
 * Journal « Police » d'une PÉRIODE — pilotée par le datepicker GLOBAL du header (`?from&to`,
 * résolue en `Period` par la page via `resolvePeriod`, comme Santé/Chatters). Plus de bascule
 * Jour/Mois locale (retirée 2026-08-17) : KPIs et historique suivent la même plage.
 * RLS : page `police` (0078 — la BASE ne cloisonne pas ; tout porteur de la page lit tout).
 * `chatter_id` désigne un MEMBRE (`profiles`). Noms (chatteur + contrôleur) résolus
 * via `profiles` (client admin).
 *
 * PÉRIMÈTRE PAR RÔLE (décision Benoit 2026-08-06) : `getCreatorScope` (lib/services, SOURCE
 * UNIQUE partagée avec le Rapport — l'audit du même jour a supprimé la copie manuscrite qui
 * vivait ici). Appliqué côté serveur : les sanctions ET les compteurs hors périmètre ne
 * partent pas au navigateur. Admin, chatteur (lecture), encadrant sans modèle assigné : tout.
 * La RLS 0078 reste non cloisonnée pour la LECTURE ; côté ÉCRITURE, le périmètre est aussi
 * appliqué par les actions (`requireChatterInScope`).
 */
export async function getPolice(
  { period, callerId, callerRole }: {
    period: Period
    callerId: string
    /** Rôle BRUT (`profiles.baseRole`) — décide du cloisonnement ci-dessus. */
    callerRole: string
  },
): Promise<PoliceData> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const today = todayParis()
  // Fenêtre du compteur d'avertissements récents (aide-décision de la saisie) : les 30 derniers
  // jours GLISSANTS — indépendante de la période affichée, la saisie date d'aujourd'hui ou presque.
  const since = addDays(today, -30)

  // Périmètre modèles de l'appelant — kické tout de suite, attendu après les fetches.
  const scopePromise = getCreatorScope(callerId, callerRole)

  // Entrées de la plage [from, to] (bornes incluses). `police_entries` est une table de FAITS
  // (plusieurs entrées/jour/chatteur) → `fetchAll` (guidelines-data-loading §2 : jamais de select
  // nu sur une table de faits — le pari « une plage < 1000 entrées » serait une troncature
  // silencieuse le jour où il tombe). Ordre DÉTERMINISTE `created_at, id`, requis par la pagination.
  const entriesQuery = fetchAll((from, to) =>
    supabase
      .from('police_entries')
      .select('*')
      .gte('occurred_on', period.from)
      .lte('occurred_on', period.to)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )

  const [entriesRes, recentWarnsRes, profilesRes, assignRes, scope] = await Promise.all([
    entriesQuery,
    fetchAll((from, to) =>
      supabase
        .from('police_entries')
        .select('chatter_id')
        .eq('kind', 'warning')
        .gte('occurred_on', since)
        .lte('occurred_on', today)
        .order('occurred_on', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    // Membres (client admin, `fetchAll` anti-troncature) : résolution des NOMS — chatteur (chatter_id)
    // ET contrôleur (controller_id) sont tous deux des `profiles` — et OPTIONS (role chatteur).
    fetchAll((from, to) => admin.from('profiles').select('id, display_name, role').order('id').range(from, to)),
    // Assignations chatteur ↔ modèle (client admin — usage INTERNE au service uniquement : rien
    // de tout ça ne part au navigateur, l'audit 2026-08-06 a retiré les champs qui fuyaient).
    fetchAll((from, to) =>
      admin.from('profile_creators').select('profile_id, creator_id').order('profile_id').range(from, to),
    ),
    scopePromise,
  ])
  if (entriesRes.error) throw new Error(entriesRes.error.message)
  if (recentWarnsRes.error) throw new Error(recentWarnsRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (assignRes.error) throw new Error(assignRes.error.message)
  const rows = entriesRes.data
  const recentWarns = recentWarnsRes.data
  const profileRows = profilesRes.data
  const assignRows = assignRes.data

  // Noms : chatteur (chatter_id) ET contrôleur (controller_id) sont tous deux des `profiles`.
  const nameById: Record<string, string> = {}
  for (const p of profileRows ?? []) if (p.id && p.display_name) nameById[p.id] = p.display_name

  // Assignations chatteur → modèles : support du périmètre (interne, jamais renvoyé).
  const creatorsByChatter: Record<string, string[]> = {}
  for (const a of assignRows ?? []) (creatorsByChatter[a.profile_id] ??= []).push(a.creator_id)

  const inScope = (chatterId: string) =>
    !scope || (creatorsByChatter[chatterId] ?? []).some((c) => scope.has(c))

  // Compteur d'avertissements récents — borné au périmètre comme tout le reste (l'audit y a
  // trouvé la seule dérivation qui l'oubliait).
  const warningsByChatter: Record<string, number> = {}
  for (const w of recentWarns ?? [])
    if (inScope(w.chatter_id))
      warningsByChatter[w.chatter_id] = (warningsByChatter[w.chatter_id] ?? 0) + 1

  // Options de saisie chatteur = membres role chatteur DU périmètre.
  const chatterOptions = (profileRows ?? [])
    .filter((p) => p.role === 'chatteur' && p.display_name && inScope(p.id))
    .map((p) => ({ id: p.id, name: p.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Le journal lui-même suit le périmètre : les sanctions hors modèles de l'appelant ne
  // quittent pas le serveur.
  const entries: PoliceEntry[] = (rows ?? []).filter((r) => inScope(r.chatter_id)).map((r) => ({
    id: r.id,
    chatterId: r.chatter_id,
    chatterName: nameById[r.chatter_id] ?? '?',
    controllerName: r.controller_id ? (nameById[r.controller_id] ?? '—') : '—',
    kind: r.kind === 'malus' ? 'malus' : 'warning',
    errorLabel: r.error_key ? (ERROR_LABEL[r.error_key] ?? r.error_key) : null,
    amountEur: Number(r.amount_eur),
    note: r.note,
    shift: r.shift,
    occurredOn: r.occurred_on,
    createdAt: r.created_at,
  }))

  return {
    periodLabel: period.label,
    entries,
    chatterOptions,
    warningsByChatter,
  }
}
