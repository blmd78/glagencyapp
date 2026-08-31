import { moduleProgress } from '@glagency/core'
import { getMyBests } from '@/lib/services/training-bests'
import { getAllCases, getModuleRefs } from '@/lib/services/training-public'
import { createClient } from '@/lib/supabase/server'
import { toSegments } from '../mappers'
import type { ModuleWheelData, ModuleWheelModule, ModuleWheelSpin } from '../types'

/** Fenêtre de « Mes gains » — un chatter a au plus 7 tours, la borne est un garde-fou. */
const GAINS_LIMIT = 50

/**
 * La page « Ma roue » : la config, les tours en attente, l'état des 7 modules et les gains passés
 * du VISITEUR. Cinq lectures en parallèle, toutes sous RLS.
 *
 * L'état par module vient de la RPC `training_module_wheel_state` (0136) et non d'un `select` sur
 * les sessions : un chatter peut en avoir des centaines (l'import GLA en a chargé jusqu'à 400 pour
 * un profil) et un `select` nu tronquerait à 1000 lignes, en silence. L'agrégat est fait en SQL.
 *
 * D5 est portée par la RPC (`legacy_id is null`) : rien à refiltrer ici.
 *
 * S'y ajoutent les cas actifs et les meilleurs résultats du visiteur, UNIQUEMENT pour recalculer la
 * progression telle que « Ma formation » l'affiche. Sans elle, les deux écrans montraient le même
 * module avec deux chiffres qui ne se recoupaient pas (« 22/23 cas » ici, « 0/23 » là) et la seule
 * lecture possible était « c'est cassé » ; on affiche maintenant les deux, côte à côte et nommés.
 */
export async function getModuleWheel(profileId: string): Promise<ModuleWheelData> {
  const supabase = await createClient()
  const [cfgRes, ticketsRes, stateRes, spinsRes, modules, allCases, mine] = await Promise.all([
    supabase.from('training_module_wheel_config').select('title, segments').eq('id', 1).single(),
    // `reason` en plus : cette même lecture rapatrie déjà TOUS les tickets de MODULE du visiteur
    // (`not('module_id', 'is', null)`), donc tous les `ticket_id` que peut porter un spin de
    // CETTE roue — inutile d'y revenir plus bas pour lire les libellés des tickets consommés.
    supabase
      .from('training_wheel_tickets')
      .select('id, module_id, used_at, reason')
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
    // Table de référence bornée (quelques centaines de lignes, un `order` explicite) : pas de
    // troncature silencieuse à craindre, contrairement aux sessions.
    getAllCases(),
    getMyBests(profileId),
  ])
  if (cfgRes.error) throw new Error(cfgRes.error.message)
  if (ticketsRes.error) throw new Error(ticketsRes.error.message)
  if (stateRes.error) throw new Error(stateRes.error.message)
  if (spinsRes.error) throw new Error(spinsRes.error.message)

  const tickets = ticketsRes.data ?? []
  const state = new Map((stateRes.data ?? []).map((r) => [r.module_id, r]))
  // Un module peut porter DEUX états dans les tickets ? Non : l'unicité (profile_id, module_id) de
  // 0136 en garantit au plus un — la Map ne peut donc pas écraser une valeur utile par une autre.
  const parModule = new Map(tickets.map((t) => [t.module_id as string, t]))
  // id → reason, à partir des tickets de MODULE déjà en main (aucune requête de plus). Sert AUSSI
  // de discriminant : un `ticket_id` de spin absent d'ici ne peut venir que de la roue nº 1
  // (encadrant) — voir plus bas.
  const raisons = new Map(tickets.map((t) => [t.id, t.reason]))

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
      // TOUS les cas actifs du module, BOSS COMPRIS — et c'est une divergence VOULUE avec « Ma
      // formation » et la page Modules, qui excluent le boss (il s'y joue à part, sous son propre
      // verrou). Ici le module boss est l'un des 7 qui donnent un tour de roue : sa carte doit
      // compter son cas boss, sinon elle afficherait 0/0 face à un « 0/1 validé à 60 » et
      // recréerait exactement l'incohérence qu'on corrige. Aligné, du même coup, sur `cas_actifs`
      // de la RPC, qui ne filtre pas non plus le boss.
      progress: moduleProgress(allCases.filter((c) => c.moduleId === m.id), mine.bests),
    }
  })

  // `raisons.has(...)` : `.not('ticket_id', 'is', null)` sur la requête ci-dessus ne suffit PAS à
  // isoler les spins de CETTE roue — dès que « offrir un tour » (0121:12) créera des tickets
  // d'encadrant (roue nº 1), leurs spins porteront eux aussi un `ticket_id` non nul, mais SUR UN
  // TICKET SANS `module_id`, absent de la map ci-dessus. Sans ce filtre, ils remonteraient dans
  // « Mes gains » et gonfleraient `totalEur` d'un montant qui n'appartient pas à cette roue.
  const spins: ModuleWheelSpin[] = (spinsRes.data ?? [])
    .filter((s) => s.ticket_id != null && raisons.has(s.ticket_id))
    .map((s) => ({
      id: s.id,
      spunAt: s.spun_at,
      label: s.prize_label ?? '—',
      // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
      amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
      reason: raisons.get(s.ticket_id as string) ?? null,
    }))

  return {
    config: { title: cfgRes.data.title, segments: toSegments(cfgRes.data.segments) },
    tours: tickets.filter((t) => t.used_at == null).length,
    modules: cards,
    spins,
    totalEur: spins.reduce((n, s) => n + (s.amountEur ?? 0), 0),
  }
}
