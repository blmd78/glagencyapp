import { fetchChatterActivity } from '@glagency/mypuls/shifts'
import { SLOT_KEYS, addDays, frWeekdayDate, todayParis, type SlotKey } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { loadMypulsCookie } from '@/lib/mypuls/session'
import type { ChatterActivityData, ChatterStoredRpc, LiveDetail } from '../types'

const DAYS = 14

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
  day?: string
}): Promise<ChatterActivityData> {
  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, shift')
    .eq('id', params.profileId)
    .maybeSingle()
  if (profileError) throw new Error(profileError.message)
  if (!profile) throw new Error('Profil introuvable')

  // `todayParis()` : sur Vercel (UTC) le jour civil bascule deux heures trop tôt, et la fiche
  // s'ouvrirait sur une journée vide entre minuit et 2 h.
  const today = todayParis()
  const dayOptions = Array.from({ length: DAYS }, (_, i) => {
    const value = addDays(today, -1 - i)
    return { value, label: frWeekdayDate(value) }
  })
  const day =
    params.day && dayOptions.some((o) => o.value === params.day) ? params.day : addDays(today, -1)
  // Agrégats sur le mois glissant — la fenêtre que la fiche du tracker d'origine montrait.
  const from = addDays(today, -30)
  const to = today

  const { data, error } = await supabase.rpc('mypuls_shift_chatter', {
    p_profile: params.profileId,
    p_from: from,
    p_to: to,
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
