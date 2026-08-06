import {
  addDays,
  endOfMonth,
  frMonthLong,
  frWeekdayLong,
  startOfMonth,
  todayParis,
} from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { recentDays, recentMonths } from '@/lib/periods'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { ERROR_LABEL } from '@/lib/types/police-errors'
import type { PoliceData, PoliceEntry } from '../types'

/**
 * Journal « Police » d'une PÉRIODE — jour (défaut) ou mois — piloté par `vue`.
 * - `jour` : entrées d'un seul jour (`?day=`, défaut aujourd'hui), KPIs du jour — comportement historique.
 * - `mois` : entrées de tout le mois (`?month=`, défaut mois courant), KPIs agrégés sur le mois. Consultation
 *   pure (pas de saisie) → le compteur d'avertissements récents (aide-décision) n'est pas chargé.
 * RLS : page `police` (0078 — la BASE ne cloisonne pas ; tout porteur de la page lit tout).
 * `chatter_id` désigne désormais un MEMBRE (`profiles`). Noms (chatteur + contrôleur) résolus
 * via `profiles` (client admin).
 *
 * PÉRIMÈTRE PAR RÔLE (décision Benoit 2026-08-06), appliqué ICI, côté serveur — les sanctions
 * hors périmètre ne partent pas au navigateur :
 *   - manager / sous-manager / policier AVEC modèles assignés : CLOISONNÉS sur les chatteurs
 *     de leurs modèles (`profile_creators`) — journal, KPIs, options de saisie comprises ;
 *   - admin, chatteur (lecture) — et un manager/sous-manager/policier SANS modèle assigné : tout.
 * C'est un cloisonnement APPLICATIF (la RLS 0078 reste non cloisonnée) : un encadrant qui
 * interroge l'API en direct lit toujours tout — assumé, même statut que le Rapport du soir.
 */
export async function getPolice(
  { vue, day, month, callerId, callerRole }: {
    vue: 'jour' | 'mois'
    day?: string
    month?: string
    callerId: string
    /** Rôle BRUT (`profiles.baseRole`) — décide du cloisonnement ci-dessus. */
    callerRole: string
  },
): Promise<PoliceData> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const today = todayParis()
  // Fenêtres proposées aux sélecteurs PARTAGÉS (source unique `@/lib/periods`, mêmes libellés que le Rapport).
  const days = recentDays(today)
  const months = recentMonths(today)

  // Jour : validation historique (regex seule, défaut aujourd'hui) — INCHANGÉE.
  const selectedDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today
  // Mois : `?month=` accepté seulement s'il est dans la fenêtre, sinon mois courant (même garde que le Rapport).
  const currentMonth = startOfMonth(today)
  const selectedMonth = month && months.some((m) => m.month === month) ? month : currentMonth

  const since = addDays(selectedDay, -30)
  const monthStart = startOfMonth(selectedMonth)
  const monthEnd = endOfMonth(selectedMonth)

  // Plage des entrées selon le mode : un seul jour (`.eq`, borné) OU tout le mois. `police_entries`
  // est une table de FAITS (plusieurs entrées/jour/chatteur) → en mois, `fetchAll` pagine par
  // `.range()` (ordre DÉTERMINISTE `created_at, id`) pour ne PAS tronquer à 1000 lignes en silence
  // (sinon KPIs et journal du mois sous-comptés dès qu'un mois dépasse 1000 entrées). Le jour reste
  // borné à une journée → pas de pagination nécessaire.
  const entriesQuery =
    vue === 'mois'
      ? fetchAll((from, to) =>
          supabase
            .from('police_entries')
            .select('*')
            .gte('occurred_on', monthStart)
            .lte('occurred_on', monthEnd)
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to),
        )
      : supabase
          .from('police_entries')
          .select('*')
          .eq('occurred_on', selectedDay)
          .order('created_at', { ascending: false })

  const [entriesRes, recentWarnsRes, profilesRes, creatorsRes, assignRes] = await Promise.all([
    entriesQuery,
    // Compteur d'avertissements récents : aide la décision de malus dans la SAISIE (mode jour uniquement).
    // En mois la saisie est masquée → requête inutile, on la saute.
    vue === 'jour'
      ? fetchAll((from, to) =>
          supabase
            .from('police_entries')
            .select('chatter_id')
            .eq('kind', 'warning')
            .gte('occurred_on', since)
            .lte('occurred_on', selectedDay)
            .order('occurred_on', { ascending: false })
            .order('id')
            .range(from, to),
        )
      : Promise.resolve(null),
    // Membres (client admin, `fetchAll` anti-troncature) : résolution des NOMS — chatteur (chatter_id)
    // ET contrôleur (controller_id) sont tous deux des `profiles` — et OPTIONS (role chatteur).
    fetchAll((from, to) => admin.from('profiles').select('id, display_name, role').order('id').range(from, to)),
    // Modèles actifs : options du filtre « Modèles » du journal.
    admin.from('creators').select('id, name, active'),
    // Assignations chatteur ↔ modèle (client admin : le RLS de profile_creators cloisonne par
    // appelant alors que le journal est agence-wide). Sert le filtre ET le défaut « mes modèles ».
    fetchAll((from, to) =>
      admin.from('profile_creators').select('profile_id, creator_id').order('profile_id').range(from, to),
    ),
  ])
  if (entriesRes.error) throw new Error(entriesRes.error.message)
  if (recentWarnsRes?.error) throw new Error(recentWarnsRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (assignRes.error) throw new Error(assignRes.error.message)
  const rows = entriesRes.data
  const recentWarns = recentWarnsRes?.data
  const profileRows = profilesRes.data
  const creatorRows = creatorsRes.data
  const assignRows = assignRes.data

  // Noms : chatteur (chatter_id) ET contrôleur (controller_id) sont tous deux des `profiles`.
  const nameById: Record<string, string> = {}
  for (const p of profileRows ?? []) if (p.id && p.display_name) nameById[p.id] = p.display_name
  const chatterName = nameById
  const controllerName = nameById

  const warningsByChatter: Record<string, number> = {}
  for (const w of recentWarns ?? [])
    warningsByChatter[w.chatter_id] = (warningsByChatter[w.chatter_id] ?? 0) + 1

  // Assignations chatteur → modèles + modèles de l'appelant (périmètre des encadrants).
  const creatorsByChatter: Record<string, string[]> = {}
  const myCreatorIds: string[] = []
  for (const a of assignRows ?? []) {
    ;(creatorsByChatter[a.profile_id] ??= []).push(a.creator_id)
    if (a.profile_id === callerId) myCreatorIds.push(a.creator_id)
  }

  // Périmètre par rôle (cf. en-tête) : encadrant OU policier avec modèles = borné à SES modèles.
  const scope =
    (callerRole === 'manager' || callerRole === 'sous-manager' || callerRole === 'police') &&
    myCreatorIds.length > 0
      ? new Set(myCreatorIds)
      : null
  const inScope = (chatterId: string) =>
    !scope || (creatorsByChatter[chatterId] ?? []).some((c) => scope.has(c))

  // Options de saisie/filtre chatteur = membres role chatteur DU périmètre.
  const chatterOptions = (profileRows ?? [])
    .filter((p) => p.role === 'chatteur' && p.display_name && inScope(p.id))
    .map((p) => ({ id: p.id, name: p.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Options du sélecteur de modèles : bornées au périmètre aussi — un encadrant cloisonné
  // n'affine que parmi SES modèles (« Tous les modèles » = tout SON périmètre).
  const creatorOptions = (creatorRows ?? [])
    .filter((c) => c.active && c.name && (!scope || scope.has(c.id)))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Le journal lui-même suit le périmètre : les sanctions hors modèles de l'appelant ne
  // quittent pas le serveur.
  const entries: PoliceEntry[] = (rows ?? []).filter((r) => inScope(r.chatter_id)).map((r) => ({
    id: r.id,
    chatterId: r.chatter_id,
    chatterName: chatterName[r.chatter_id] ?? '?',
    controllerName: r.controller_id ? (controllerName[r.controller_id] ?? '—') : '—',
    kind: r.kind === 'malus' ? 'malus' : 'warning',
    errorKey: r.error_key,
    errorLabel: r.error_key ? (ERROR_LABEL[r.error_key] ?? r.error_key) : null,
    amountEur: Number(r.amount_eur),
    note: r.note,
    shift: r.shift,
    occurredOn: r.occurred_on,
    createdAt: r.created_at,
  }))

  return {
    vue,
    day: selectedDay,
    dayLabel: frWeekdayLong(selectedDay),
    month: selectedMonth,
    monthLabel: frMonthLong(selectedMonth),
    entries,
    chatterOptions,
    warningsByChatter,
    // Les KPIs de la période sont calculés CÔTÉ CLIENT (police-view) : ils suivent le filtre
    // « Modèles », des cartes figées au-dessus d'un journal filtré mentiraient.
    creatorOptions,
    creatorsByChatter,
    days,
    months,
  }
}
