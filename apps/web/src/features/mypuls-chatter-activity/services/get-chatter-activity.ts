import { createAdminClient } from '@glagency/db'
import { fetchChatterActivity } from '@glagency/mypuls/shifts'
import { SLOT_KEYS, addDays, frWeekdayDate, todayParis, type SlotKey } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { loadMypulsCookie } from '@/lib/mypuls/session'
import type { ChatterActivityData, ChatterStoredRpc, LiveDetail } from '../types'

/**
 * Nombre de jours proposés au sélecteur du graphe minute par minute, quand la période du header
 * est plus longue. Le graphe est par nature d'UN jour (1 440 points) : au-delà d'une poignée de
 * jours, le menu devient une liste illisible et l'appel MyPuls reste de toute façon quotidien.
 */
const MAX_DAY_OPTIONS = 31

const isSlot = (v: unknown): v is SlotKey =>
  typeof v === 'string' && (SLOT_KEYS as readonly string[]).includes(v)

/**
 * Fiche d'activité d'un chatteur.
 *
 * Deux sources, volontairement séparées :
 *   — les AGRÉGATS viennent de nos tables (RPC `mypuls_shift_chatter`), donc toujours là ;
 *   — le DÉTAIL minute par minute est lu EN DIRECT chez MyPuls, à l'ouverture.
 *
 * Pourquoi ne pas l'ingérer : c'est un appel par chatteur ET par jour (~186 ko). Pour 155
 * personnes sur 14 jours, ça ferait ~1 400 appels et ~250 Mo par rattrapage — pour une donnée
 * que personne ne regarde tant qu'il n'a pas ouvert la fiche.
 *
 * Un échec de MyPuls ne fait PAS tomber la page : les agrégats restent affichés et le détail
 * dit pourquoi il manque.
 */
export async function getChatterActivity(params: {
  profileId: string
  /** Bornes du sélecteur de dates du HEADER — la même période que le Relevé d'équipe. */
  from: string
  to: string
  periodLabel: string
  day?: string
}): Promise<ChatterActivityData> {
  const supabase = await createClient()

  // Le profil est lu en SERVICE-ROLE, et pas via `supabase` : la policy de `profiles` exige
  // `is_admin() or is_manager()`, si bien qu'un porteur de « presence » de rôle police ou
  // chatteur tombait sur « Profil introuvable » — la fiche était inaccessible pour eux. Le
  // PÉRIMÈTRE modèles, lui, est déjà appliqué en amont par la page (`isChatterInScope` +
  // `notFound()`), qui est le bon endroit pour ça. Même parade que `displayNames` du relevé.
  //
  // `chatter_id` est lu ICI parce que c'est la clé du relevé depuis 0144 : sans lui, la fiche
  // d'un membre rattaché n'affiche que les journées où `profile_id` avait été résolu.
  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, display_name, shift, chatter_id')
    .eq('id', params.profileId)
    .maybeSingle()
  if (profileError) throw new Error(profileError.message)
  if (!profile) throw new Error('Profil introuvable')

  // LA PÉRIODE VIENT DU HEADER, comme le Relevé d'équipe : ouvrir une fiche depuis le relevé
  // et y lire d'autres bornes que celles qu'on venait de régler était le meilleur moyen de
  // croire à une incohérence de la donnée.
  //
  // Bornée à hier : aujourd'hui n'est jamais relevé (le créneau du soir court jusqu'à 05 h
  // demain). `todayParis()` et non `new Date()` — sur Vercel (UTC) le jour civil bascule deux
  // heures trop tôt.
  const yesterday = addDays(todayParis(), -1)
  const to = params.to > yesterday ? yesterday : params.to
  const from = params.from > to ? to : params.from

  // Le sélecteur du graphe ne propose que des jours DE la période, du plus récent au plus
  // ancien, plafonné pour rester lisible.
  const dayOptions: { value: string; label: string }[] = []
  for (let d = to; d >= from && dayOptions.length < MAX_DAY_OPTIONS; d = addDays(d, -1)) {
    dayOptions.push({ value: d, label: frWeekdayDate(d) })
  }
  const day =
    params.day && dayOptions.some((o) => o.value === params.day)
      ? params.day
      : (dayOptions[0]?.value ?? to)

  const { data, error } = await supabase.rpc('mypuls_shift_chatter', {
    p_profile: params.profileId,
    p_from: from,
    p_to: to,
    // Les DEUX clés (0145) : `profile_id` seul laissait vides les fiches des membres rattachés
    // dont l'historique ne porte que `chatter_id`, et `chatter_id` seul aurait vidé celles des
    // 150 profils actifs sans rattachement. Omis = le défaut SQL (`null`).
    p_chatter: profile.chatter_id ?? undefined,
  })
  if (error) throw new Error(error.message)

  // Cast explicite depuis `Json` (cf. docs/guidelines-data-loading.md — `.overrideTypes()` est
  // inapplicable sur l'union récursive).
  const stored = (data as unknown as ChatterStoredRpc | null) ?? {
    coverage: [],
    daysWorked: 0,
    activeMinutes: 0,
    messages: 0,
    models: [],
    mypulsUserId: null,
  }

  // Les réglages qui font foi : le seuil sert au verdict, `idle` à la lecture MyPuls. Les
  // figer en dur ferait diverger cette fiche du relevé d'équipe sur la même journée.
  const { data: settings } = await supabase
    .from('mypuls_shift_settings')
    .select('idle_minutes, coverage_threshold')
    .eq('id', 1)
    .maybeSingle()
  const threshold = Number(settings?.coverage_threshold ?? 80)

  return {
    periodLabel: params.periodLabel,
    threshold,
    profileId: profile.id,
    memberName: profile.display_name ?? 'Sans nom',
    memberShift: isSlot(profile.shift) ? profile.shift : null,
    day,
    from,
    to,
    dayOptions,
    stored,
    live: await liveDetail(stored.mypulsUserId, day, settings?.idle_minutes),
  }
}

/**
 * Le détail minute par minute du jour demandé.
 *
 * La fenêtre va de 00:00 à 05:00 le LENDEMAIN : sans ce débord, la nuit d'un chatteur du soir
 * serait coupée à minuit — exactement le piège qui fait chuter une couverture de 97 % à 37 %.
 */
async function liveDetail(
  mypulsUserId: string | null,
  day: string,
  idleMinutes?: number,
): Promise<LiveDetail> {
  if (!mypulsUserId) return { status: 'non-rattache' }
  try {
    const cookie = await loadMypulsCookie()
    if (!cookie) return { status: 'indisponible', reason: 'Aucune session MyPuls enregistrée.' }
    const activity = await fetchChatterActivity(cookie, {
      mypulsUserId,
      start: `${day} 00:00`,
      end: `${addDays(day, 1)} 05:00`,
      idleMinutes,
    })
    return { status: 'ok', activity }
  } catch (err) {
    // Volontairement rattrapé : MyPuls est un tiers, et son indisponibilité ne doit pas
    // effacer les chiffres qu'on détient déjà.
    return { status: 'indisponible', reason: err instanceof Error ? err.message : String(err) }
  }
}
