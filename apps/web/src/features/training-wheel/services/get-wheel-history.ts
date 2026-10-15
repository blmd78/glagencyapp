import { createAdminClient } from '@glagency/db'
import { chunk } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import { gainsByChatter } from '../gains-by-chatter'
import { historyWeekBounds } from '../history-range'
import type { WheelHistory, WheelHistoryRow } from '../types'

/**
 * Historique encadrant : TOUS les tirages des semaines qui touchent la période du header (sélecteur
 * de dates habituel, 2026-10-12 — avant, les 200 derniers seulement : avec la roue des modules, une
 * semaine non encore payée sortait de l'écran), TOUS chatters confondus. Le cloisonnement est
 * réel — la RLS de `training_wheel_spins` n'ouvre les lignes des autres qu'à `frm-suivi`/admin ;
 * un chatter qui appellerait ce service ne verrait que les siennes.
 *
 * Les noms des chatteurs viennent de `training_overview_roster` (RPC déjà gardée par
 * `has_page('frm-suivi')`) : une lecture au lieu d'une jointure `profiles` par ligne. `'—'` pour
 * quelqu'un sorti du roster (parti, droit Entraînement retiré) — la ligne d'argent reste lisible.
 *
 * Les noms des ENCADRANTS qui ont lancé (`spun_by`, 0121) sont résolus en service-role, et ce
 * n'est pas un raccourci : la policy de `profiles` ne laisse lire tous les noms qu'à un admin ou un
 * manager, or le droit `frm-suivi` est un droit de PAGE — un encadrant qui ne serait ni l'un ni
 * l'autre verrait « — » partout, ce qui viderait la traçabilité de son sens. La garde est faite
 * ici, et on ne lit qu'un `display_name` pour les ids déjà présents dans l'historique.
 */
export async function getWheelHistory(period: Period): Promise<WheelHistory> {
  const supabase = await createClient()
  const { fromWeek, toWeek } = historyWeekBounds(period)
  const [spinsRes, rosterRes] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('training_wheel_spins')
        .select('id, profile_id, spun_by, week, spun_at, won, prize_label, amount_eur, paid_at, ticket_id')
        .gte('week', fromWeek)
        .lte('week', toWeek)
        .order('spun_at', { ascending: false })
        .order('id')
        .range(f, t),
    ),
    supabase.rpc('training_overview_roster'),
  ])
  if (spinsRes.error) throw new Error(spinsRes.error.message)
  if (rosterRes.error) throw new Error(rosterRes.error.message)

  const names = new Map((rosterRes.data ?? []).map((r) => [r.profile_id, r.display_name]))

  const spunByIds = [...new Set((spinsRes.data ?? []).flatMap((s) => (s.spun_by ? [s.spun_by] : [])))]
  const lanceurs = new Map<string, string>()
  if (spunByIds.length > 0) {
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('id, display_name, email')
      .in('id', spunByIds)
    if (error) throw new Error(error.message)
    for (const p of data ?? []) lanceurs.set(p.id, p.display_name ?? p.email ?? '—')
  }

  const ticketIds = [...new Set((spinsRes.data ?? []).flatMap((s) => (s.ticket_id ? [s.ticket_id] : [])))]
  const raisons = new Map<string, string>()
  if (ticketIds.length > 0) {
    // Client UTILISATEUR : la RLS de `training_wheel_tickets` ouvre déjà toutes les lignes à
    // `frm-suivi` — pas besoin du service-role ici, contrairement aux noms des encadrants.
    // Par lots : sans la limite de 200 tirages, une longue période dépasse 1 000 tickets — le plafond
    // de lignes de l'API, et une URL `in.(…)` démesurée. 200 identifiants par requête, en parallèle.
    const lots = await Promise.all(
      chunk(ticketIds, 200).map((ids) => supabase.from('training_wheel_tickets').select('id, reason').in('id', ids)),
    )
    for (const { data, error } of lots) {
      if (error) throw new Error(error.message)
      for (const t of data ?? []) raisons.set(t.id, t.reason)
    }
  }

  const rows: WheelHistoryRow[] = (spinsRes.data ?? []).map((s) => ({
    id: s.id,
    profileId: s.profile_id,
    displayName: names.get(s.profile_id) ?? '—',
    spunByName: s.spun_by ? (lanceurs.get(s.spun_by) ?? '—') : null,
    origine: s.ticket_id ? (raisons.get(s.ticket_id) ?? 'Roue des modules') : 'Encadrant',
    week: s.week,
    spunAt: s.spun_at,
    won: s.won,
    prizeLabel: s.prize_label,
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
    paidAt: s.paid_at,
  }))

  // Σ des GAGNÉS uniquement : un lot non monétaire (day off) et un Raté comptent 0.
  const totalEur = rows.reduce((n, r) => n + (r.won ? (r.amountEur ?? 0) : 0), 0)

  const acc = new Map<string, { week: string; count: number; totalEur: number }>()
  for (const r of rows) {
    const w = acc.get(r.week) ?? { week: r.week, count: 0, totalEur: 0 }
    w.count += 1
    w.totalEur += r.won ? (r.amountEur ?? 0) : 0
    acc.set(r.week, w)
  }
  // Tri explicite (et pas l'ordre d'insertion) : `spun_at` desc ne garantit pas `week` desc — les
  // tirages d'avant la règle du 2026-08-24 portent la semaine RÉCOMPENSÉE, pas celle du tirage.
  const byWeek = [...acc.values()]
    .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0))
    .map((w) => ({ ...w, byChatter: gainsByChatter(rows.filter((r) => r.week === w.week)) }))

  return { rows, totalEur, byChatter: gainsByChatter(rows), byWeek }
}
