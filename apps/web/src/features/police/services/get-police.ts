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
import { POLICE_ERRORS, type PoliceData, type PoliceEntry } from '../types'

const ERROR_LABEL: Record<string, string> = Object.fromEntries(
  POLICE_ERRORS.map((e) => [e.key, e.label]),
)

/**
 * Journal « Police » d'une PÉRIODE — jour (défaut) ou mois — piloté par `vue`.
 * - `jour` : entrées d'un seul jour (`?day=`, défaut aujourd'hui), KPIs du jour — comportement historique.
 * - `mois` : entrées de tout le mois (`?month=`, défaut mois courant), KPIs agrégés sur le mois. Consultation
 *   pure (pas de saisie) → le compteur d'avertissements récents (aide-décision) n'est pas chargé.
 * RLS : page `police`, NON cloisonné (cf. 0078 — tout porteur de la page voit toutes les sanctions).
 * `chatter_id` désigne désormais un MEMBRE (`profiles`) ; les OPTIONS = tous les membres role
 * chatteur (aucun filtre modèle). Noms (chatteur + contrôleur) résolus via `profiles` (client admin).
 */
export async function getPolice(
  { vue, day, month }: { vue: 'jour' | 'mois'; day?: string; month?: string },
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

  const [entriesRes, recentWarnsRes, profilesRes] = await Promise.all([
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
  ])
  if (entriesRes.error) throw new Error(entriesRes.error.message)
  if (recentWarnsRes?.error) throw new Error(recentWarnsRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  const rows = entriesRes.data
  const recentWarns = recentWarnsRes?.data
  const profileRows = profilesRes.data

  // Noms : chatteur (chatter_id) ET contrôleur (controller_id) sont tous deux des `profiles`.
  const nameById: Record<string, string> = {}
  for (const p of profileRows ?? []) if (p.id && p.display_name) nameById[p.id] = p.display_name
  const chatterName = nameById
  const controllerName = nameById

  // Options = TOUS les membres role chatteur (Police NON cloisonné, cf. 0078 — aucun filtre modèle).
  const chatterOptions = (profileRows ?? [])
    .filter((p) => p.role === 'chatteur' && p.display_name)
    .map((p) => ({ id: p.id, name: p.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const warningsByChatter: Record<string, number> = {}
  for (const w of recentWarns ?? [])
    warningsByChatter[w.chatter_id] = (warningsByChatter[w.chatter_id] ?? 0) + 1

  const entries: PoliceEntry[] = (rows ?? []).map((r) => ({
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
    totalMalusEur: entries.filter((e) => e.kind === 'malus').reduce((s, e) => s + e.amountEur, 0),
    warningCount: entries.filter((e) => e.kind === 'warning').length,
    chattersConcerned: new Set(entries.map((e) => e.chatterId)).size,
    days,
    months,
  }
}
