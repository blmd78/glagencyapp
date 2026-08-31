import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { WheelHistory, WheelHistoryRow } from '../types'

/** Fenêtre de l'historique encadrant — pas de pagination en v1 (décision du plan). */
const HISTORY_LIMIT = 200

/**
 * Historique encadrant : les 200 derniers tirages, TOUS chatters confondus. Le cloisonnement est
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
export async function getWheelHistory(): Promise<WheelHistory> {
  const supabase = await createClient()
  const [spinsRes, rosterRes] = await Promise.all([
    supabase
      .from('training_wheel_spins')
      .select('id, profile_id, spun_by, week, spun_at, won, prize_label, amount_eur, paid_at, ticket_id')
      .order('spun_at', { ascending: false })
      .limit(HISTORY_LIMIT),
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
    const { data, error } = await supabase.from('training_wheel_tickets').select('id, reason').in('id', ticketIds)
    if (error) throw new Error(error.message)
    for (const t of data ?? []) raisons.set(t.id, t.reason)
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
  const byWeek = [...acc.values()].sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0))

  // `rows.length === HISTORY_LIMIT` : la requête a rendu PILE la limite, donc des lignes plus
  // anciennes existent probablement au-delà (`spun_at` desc). Avec la roue des modules, la table
  // va passer de 2 à ~1350 lignes (193 chatters × 7 tours) — ce plafond, choisi quand il n'y avait
  // presque rien, sera désormais atteint en usage normal. Les totaux de `byWeek` ne portent alors
  // que sur ce jeu tronqué, et la semaine la plus ancienne de la liste (fin de `byWeek`, trié desc)
  // est celle qui est coupée : le composant doit le dire, pas laisser un total partiel se présenter
  // comme exact sur un écran qui sert à décider ce qui reste à payer.
  const truncated = rows.length === HISTORY_LIMIT

  return { rows, totalEur, byWeek, truncated }
}
