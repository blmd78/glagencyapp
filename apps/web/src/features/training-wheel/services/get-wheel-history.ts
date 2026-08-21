import { createClient } from '@/lib/supabase/server'
import type { WheelHistory, WheelHistoryRow } from '../types'

/** Fenêtre de l'historique encadrant — pas de pagination en v1 (décision du plan). */
const HISTORY_LIMIT = 200

/**
 * Historique encadrant : les 200 derniers tirages, TOUS chatters confondus. Le cloisonnement est
 * réel — la RLS de `training_wheel_spins` n'ouvre les lignes des autres qu'à `frm-suivi`/admin ;
 * un chatter qui appellerait ce service ne verrait que les siennes.
 *
 * Les noms viennent de `training_overview_roster` (RPC déjà gardée par `has_page('frm-suivi')`) :
 * une lecture au lieu d'une jointure `profiles` par ligne. `'—'` pour quelqu'un sorti du roster
 * (parti, droit Entraînement retiré) — la ligne d'argent reste lisible.
 */
export async function getWheelHistory(): Promise<WheelHistory> {
  const supabase = await createClient()
  const [spinsRes, rosterRes] = await Promise.all([
    supabase
      .from('training_wheel_spins')
      .select('id, profile_id, week, spun_at, won, prize_label, amount_eur, paid_at')
      .order('spun_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.rpc('training_overview_roster'),
  ])
  if (spinsRes.error) throw new Error(spinsRes.error.message)
  if (rosterRes.error) throw new Error(rosterRes.error.message)

  const names = new Map((rosterRes.data ?? []).map((r) => [r.profile_id, r.display_name]))
  const rows: WheelHistoryRow[] = (spinsRes.data ?? []).map((s) => ({
    id: s.id,
    profileId: s.profile_id,
    displayName: names.get(s.profile_id) ?? '—',
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
  // Tri explicite (et pas l'ordre d'insertion) : `spun_at` desc ne garantit pas `week` desc — un
  // ticket vieux d'un mois peut être joué aujourd'hui.
  const byWeek = [...acc.values()].sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0))

  return { rows, totalEur, byWeek }
}
