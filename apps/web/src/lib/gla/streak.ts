import { todayParis } from '@glagency/core'
import type { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * Réparation du streak après un import — la PARADE OBLIGATOIRE de §3.7.
 *
 * `training_refresh_stats` (0113:1510-1578) calcule le streak de façon INCRÉMENTALE et
 * DÉPENDANTE DE L'ORDRE :
 *   `if v_last is null or v_last < v_day - 1 then 1; elsif v_last = v_day - 1 then +1; else garde`
 * Trois raisons pour lesquelles c'est faux sur un import :
 *  1. rejouer les couples (profil, cas) dans l'ordre de l'import produit une valeur ARBITRAIRE,
 *     jamais la plus longue série réelle ;
 *  2. `last_active_day` ne recule jamais (`greatest(coalesce(v_last, v_day), v_day)`) : importer
 *     une session ancienne après une récente ne rejoue jamais la série ;
 *  3. la lecture « effective » remet à 0 si le dernier jour actif est antérieur à hier.
 *
 * D'où un UPDATE dédié, APRÈS `training_legacy_refresh_all` (qui écrit lui aussi ces deux
 * colonnes — l'ordre décide qui gagne) : plus longue série de jours civils Europe/Paris
 * consécutifs se TERMINANT au dernier jour actif, et `last_active_day` posé en cohérence.
 *
 * Ce qui n'est PAS touché : `active_days`, `cases_done`, `avg_total`, `points`, `boss_best`,
 * `boss_done` sont recalculés DEPUIS LES FAITS par la même fonction — corrects quel que soit
 * l'ordre.
 */

/**
 * Plus longue série de jours consécutifs se terminant au DERNIER jour de la liste. Pur, testable.
 * `days` : jours civils 'YYYY-MM-DD', dans n'importe quel ordre, doublons admis.
 */
export function streakFromDays(days: readonly string[]): { streakDays: number; lastActiveDay: string | null } {
  const uniq = [...new Set(days)].sort()
  const last = uniq.at(-1)
  if (!last) return { streakDays: 0, lastActiveDay: null }
  const asMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  let streak = 1
  for (let i = uniq.length - 1; i > 0; i--) {
    // Écart d'exactement un jour : la série continue. Sinon elle est rompue — on s'arrête.
    if (asMs(uniq[i]) - asMs(uniq[i - 1]) !== 86_400_000) break
    streak += 1
  }
  return { streakDays: streak, lastActiveDay: last }
}

/**
 * Recalcule et écrit `streak_days` / `last_active_day` du profil depuis SES sessions notées.
 *
 * `fetchAll` obligatoire (guidelines data-loading) : un `select` nu tronque à 1 000 lignes en
 * silence — un chatter qui cumule 399 sessions reprises et ses sessions jouées ici peut dépasser,
 * et la troncature raboterait sa série la plus ancienne sans le dire.
 *
 * L'UPDATE ne crée jamais la ligne : elle est posée par `training_refresh_stats` (upsert), appelé
 * juste avant. Zéro session notée ⇒ zéro couple à rafraîchir ⇒ rien à écrire ici non plus.
 */
export async function refreshLegacyStreak(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ streakDays: number; lastActiveDay: string | null }> {
  const { data, error } = await fetchAll<{ scored_at: string | null }>((f, t) =>
    admin
      .from('training_sessions')
      .select('scored_at')
      .eq('profile_id', profileId)
      .eq('status', 'scored')
      .not('total', 'is', null)
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)

  // `todayParis(date)` projette un instant sur SON jour civil Paris — jamais `toISOString()`,
  // qui rendrait le jour UTC (le serveur tourne en UTC sur Vercel : 774 sessions GLA sur 17 260
  // changent de jour civil entre les deux).
  const days = data.flatMap((r) => (r.scored_at ? [todayParis(new Date(r.scored_at))] : []))
  const out = streakFromDays(days)
  if (!out.lastActiveDay) return out

  const { error: uErr } = await admin
    .from('training_profile_stats')
    .update({ streak_days: out.streakDays, last_active_day: out.lastActiveDay })
    .eq('profile_id', profileId)
  if (uErr) throw new Error(uErr.message)
  return out
}
