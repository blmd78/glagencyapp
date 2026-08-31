import { getModuleRefs } from '@/lib/services/training-public'
import { createClient } from '@/lib/supabase/server'
import { toSegments } from '../mappers'
import type { ModuleWheelData, ModuleWheelModule, ModuleWheelSpin } from '../types'

/** Fenêtre de « Mes gains » — un chatter a au plus 7 tours, la borne est un garde-fou. */
const GAINS_LIMIT = 50

/**
 * La page « Ma roue » : la config, les tours en attente, l'état des 7 modules et les gains passés
 * du VISITEUR. Quatre lectures en parallèle, toutes sous RLS.
 *
 * L'état par module vient de la RPC `training_module_wheel_state` (0136) et non d'un `select` sur
 * les sessions : un chatter peut en avoir des centaines (l'import GLA en a chargé jusqu'à 400 pour
 * un profil) et un `select` nu tronquerait à 1000 lignes, en silence. L'agrégat est fait en SQL.
 *
 * D5 est portée par la RPC (`legacy_id is null`) : rien à refiltrer ici.
 */
export async function getModuleWheel(profileId: string): Promise<ModuleWheelData> {
  const supabase = await createClient()
  const [cfgRes, ticketsRes, stateRes, spinsRes, modules] = await Promise.all([
    supabase.from('training_module_wheel_config').select('title, segments').eq('id', 1).single(),
    supabase
      .from('training_wheel_tickets')
      .select('id, module_id, used_at')
      .eq('profile_id', profileId)
      .not('module_id', 'is', null),
    supabase.rpc('training_module_wheel_state', { p_profile: profileId }),
    supabase
      .from('training_wheel_spins')
      .select('id, spun_at, prize_label, amount_eur, ticket_id')
      .eq('profile_id', profileId)
      .not('ticket_id', 'is', null)
      .order('spun_at', { ascending: false })
      .limit(GAINS_LIMIT),
    // `getModuleRefs` et pas `getModules` : celui-ci rapatrie de quoi calculer `hasCourse` et
    // `caseCount`, dont on n'a que faire ici — les compteurs viennent de la RPC.
    getModuleRefs(),
  ])
  if (cfgRes.error) throw new Error(cfgRes.error.message)
  if (ticketsRes.error) throw new Error(ticketsRes.error.message)
  if (stateRes.error) throw new Error(stateRes.error.message)
  if (spinsRes.error) throw new Error(spinsRes.error.message)

  const tickets = ticketsRes.data ?? []
  const state = new Map((stateRes.data ?? []).map((r) => [r.module_id, r]))
  // Un module peut porter DEUX états dans les tickets ? Non : l'unicité (profile_id, module_id) de
  // 0136 en garantit au plus un. `find` est donc suffisant, pas besoin de trancher.
  const parModule = new Map(tickets.map((t) => [t.module_id as string, t]))

  const cards: ModuleWheelModule[] = modules.map((m) => {
    const st = state.get(m.id)
    const ticket = parModule.get(m.id)
    return {
      id: m.id,
      code: m.code,
      title: m.title,
      emoji: m.emoji,
      total: st?.cas_actifs ?? 0,
      valides: st?.valides_ici ?? 0,
      etat: ticket ? (ticket.used_at ? 'joue' : 'gagne') : 'a_gagner',
    }
  })

  // Les libellés des tickets consommés, en UNE requête sur les ids déjà en main — pas d'embed
  // PostgREST (dont la cardinalité rendue varie) ni de jointure par ligne. Les tickets du visiteur
  // lui sont ouverts par la RLS (`profile_id = auth.uid()`).
  const ticketIds = (spinsRes.data ?? []).flatMap((s) => (s.ticket_id ? [s.ticket_id] : []))
  const raisons = new Map<string, string>()
  if (ticketIds.length > 0) {
    const { data, error } = await supabase.from('training_wheel_tickets').select('id, reason').in('id', ticketIds)
    if (error) throw new Error(error.message)
    for (const t of data ?? []) raisons.set(t.id, t.reason)
  }

  const spins: ModuleWheelSpin[] = (spinsRes.data ?? []).map((s) => ({
    id: s.id,
    spunAt: s.spun_at,
    label: s.prize_label ?? '—',
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
    reason: s.ticket_id ? (raisons.get(s.ticket_id) ?? null) : null,
  }))

  return {
    config: { title: cfgRes.data.title, segments: toSegments(cfgRes.data.segments) },
    tours: tickets.filter((t) => t.used_at == null).length,
    modules: cards,
    spins,
    totalEur: spins.reduce((n, s) => n + (s.amountEur ?? 0), 0),
  }
}
