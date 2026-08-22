import { createClient } from '@/lib/supabase/server'
import { WHEEL_TOP_N } from '@glagency/core'
import { toPrizes, toSectors } from '../mappers'
import type { MySpin, WheelData } from '../types'

/**
 * Page Roue d'un chatter : config, ticket en attente, éligibilité (RPC lecture seule), mes gains.
 * 4 lectures PARALLÈLES sous RLS (client utilisateur) — `training_wheel_tickets` / `_spins` sont
 * lisibles « moi ou encadrant frm-suivi », la config par toute la face Formation.
 *
 * `eligible` = la RPC dit 1 SANS ticket en base, donc le chatter est top 3 de la semaine passée
 * mais n'a pas encore réclamé — le client appellera `claimTicket()` au montage (attribution
 * paresseuse, aucun cron).
 */
export async function getWheel(profileId: string): Promise<WheelData> {
  const supabase = await createClient()
  const [cfg, tickets, spins, pending] = await Promise.all([
    supabase.from('training_wheel_config').select('title, sectors, prizes').eq('id', 1).single(),
    supabase
      .from('training_wheel_tickets')
      // TOUS les tours en attente (ils s'ACCUMULENT depuis 0118), du PLUS ANCIEN au plus récent :
      // c'est l'ordre dans lequel ils ont été gagnés, et la semaine la plus proche de la sortie de
      // la fenêtre de rattrapage passe en premier. On lisait le plus récent, et un seul.
      .select('id, week, reason, created_at')
      .eq('profile_id', profileId)
      .is('used_at', null)
      .order('week', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('training_wheel_spins')
      .select('id, week, spun_at, sector_label, won, prize_label, amount_eur, paid_at')
      .eq('profile_id', profileId)
      .order('spun_at', { ascending: false })
      .limit(50),
    supabase.rpc('training_wheel_pending', { p_profile: profileId, p_top: WHEEL_TOP_N }),
  ])
  // Un `if` par résultat (et pas une boucle) : c'est ce qui NARROW `cfg.data` en non-null pour
  // TypeScript — le type de `.single()` est une union { data, error: null } | { data: null, error }.
  if (cfg.error) throw new Error(cfg.error.message)
  if (tickets.error) throw new Error(tickets.error.message)
  if (spins.error) throw new Error(spins.error.message)
  if (pending.error) throw new Error(pending.error.message)

  const queue = (tickets.data ?? []).map((t) => ({ id: t.id, week: t.week, reason: t.reason, createdAt: t.created_at }))
  const ticket = queue[0] ?? null
  const mySpins: MySpin[] = (spins.data ?? []).map((s) => ({
    id: s.id,
    week: s.week,
    spunAt: s.spun_at,
    sectorLabel: s.sector_label,
    won: s.won,
    prizeLabel: s.prize_label,
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
    paidAt: s.paid_at,
  }))

  return {
    config: { title: cfg.data.title, sectors: toSectors(cfg.data.sectors), prizes: toPrizes(cfg.data.prizes) },
    ticket,
    // Nombre de tours à jouer : ceux déjà matérialisés, sinon ce que la RPC dit devoir (une
    // éligibilité dont l'octroi n'a pas encore tourné).
    pending: queue.length > 0 ? queue.length : Number(pending.data ?? 0),
    eligible: queue.length === 0 && Number(pending.data ?? 0) > 0,
    mySpins,
  }
}
