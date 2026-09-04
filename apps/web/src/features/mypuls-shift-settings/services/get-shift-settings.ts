import { createAdminClient } from '@glagency/db'
import { addDays, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type {
  MemberWithoutShift,
  OrphanLabel,
  SettingsPageRpc,
  ShiftSettingsPage,
} from '../types'

/**
 * Période observée par les fenêtres de créneau et le bac d'orphelins.
 *
 * 30 jours et non les 60 que MyPuls conserve : la question posée par cet écran est « qui
 * travaille aujourd'hui sans être compté », pas « qui a travaillé cet été ». Sur 60 jours, le
 * bac se remplirait de gens partis depuis, et on cesserait de le lire.
 */
const WINDOW_DAYS = 30

/** Valeurs de repli si la ligne unique de réglages a disparu — jamais un écran vide. */
const FALLBACK = { idleMinutes: 3, breakMinutes: 60, coverageThreshold: 80 }

export async function getShiftSettings(params: {
  /** L'appelant peut-il écrire ? Miroir applicatif de `mypuls_shift_settings_admin_write` (0138). */
  isAdmin: boolean
}): Promise<ShiftSettingsPage> {
  // `todayParis()` et jamais `new Date()` : sur Vercel (UTC), entre 00 h et 02 h heure de Paris
  // le jour civil est encore la veille.
  const today = todayParis()
  const to = addDays(today, -1)
  const from = addDays(to, -(WINDOW_DAYS - 1))

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('mypuls_shift_settings_page', {
    p_from: from,
    p_to: to,
  })
  if (error) throw new Error(error.message)

  // Cast explicite depuis `Json` : `.overrideTypes()` est inapplicable sur l'union récursive
  // (garde `IsValidResultOverride` de postgrest-js) — cf. docs/guidelines-data-loading.md.
  const rpc = (data as unknown as SettingsPageRpc | null) ?? {
    settings: null,
    windows: [],
    runs: [],
    orphans: [],
  }

  const [orphans, noShift] = await Promise.all([
    withChatterFlag(rpc.orphans),
    membersWithoutShift(),
  ])

  return {
    settings: rpc.settings ?? { ...FALLBACK, updatedAt: new Date(0).toISOString(), updatedBy: null },
    windows: rpc.windows,
    runs: rpc.runs,
    orphans,
    noShift,
    from,
    to,
    canEdit: params.isAdmin,
    missingDays: missingDays(from, to, rpc.runs),
  }
}

/**
 * Les jours de la période qu'AUCUN run réussi ne couvre.
 *
 * C'est la raison d'être de l'écran : sur le relevé, un jour sans run affiche « relevé
 * indisponible » — mais il faut venir ici pour savoir qu'il y en a douze. Un run `echec` ne
 * couvre rien, même s'il a écrit des lignes : il s'est arrêté en route, et on ne sait pas où.
 */
function missingDays(from: string, to: string, runs: SettingsPageRpc['runs']): string[] {
  const covered = new Set<string>()
  for (const r of runs) {
    if (r.status !== 'ok') continue
    for (let d = r.dayFrom; d <= r.dayTo; d = addDays(d, 1)) covered.add(d)
  }
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (!covered.has(d)) out.push(d)
  return out
}

/**
 * « Ce libellé MyPuls a-t-il déjà une ligne `chatters` ? » — en service-role, et pas dans la RPC.
 *
 * La policy `chatters_scoped_read` exige d'être admin OU d'avoir au moins un modèle assigné : en
 * `security invoker`, un porteur de `presence` sans assignation aurait lu « non » partout, sans
 * erreur, et conclu que 300 personnes sont inconnues du CRM. Le drapeau change le geste de
 * réparation — poser un lien, ou créer quelqu'un — donc il ne peut pas être approximatif.
 */
async function withChatterFlag(
  orphans: SettingsPageRpc['orphans'],
): Promise<OrphanLabel[]> {
  if (orphans.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chatters')
    .select('mypuls_user_id')
    .in('mypuls_user_id', orphans.map((o) => o.mypulsUserId))
  if (error) throw new Error(error.message)
  const known = new Set((data ?? []).map((c) => c.mypuls_user_id).filter((v): v is string => v !== null))
  return orphans.map((o) => ({ ...o, hasChatter: known.has(o.mypulsUserId) }))
}

/**
 * L'autre moitié du bac : les membres actifs SANS `profiles.shift`.
 *
 * Ceux-là ont peut-être une ligne de couverture, mais aucune n'est jamais « attendue » (D7) —
 * ils n'apparaissent donc ni dans les manquants, ni dans le filtre « seulement leur créneau », et
 * leur retard n'est comparé à rien. Le relevé ne peut rien dire d'eux tant que personne ne leur
 * a posé de créneau.
 *
 * En service-role, même raison que ci-dessus : la policy de `profiles` exige
 * `is_admin() or is_manager()`, ce qui rendrait la liste vide pour un porteur de `presence` de
 * rôle police — c'est le bug que le relevé a déjà dû contourner (`displayNames`).
 */
async function membersWithoutShift(): Promise<MemberWithoutShift[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name, chatter_id')
    .eq('role', 'chatteur')
    .is('left_at', null)
    .is('shift', null)
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    profileId: p.id,
    memberName: p.display_name ?? 'Sans nom',
    linked: p.chatter_id !== null,
  }))
}
