import type { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { refreshLegacyStreak } from './streak'

/**
 * Détachement d'un ancien compte Good Luck Agency (§7.6) — le SEUL geste destructif de la reprise.
 * Module neutre : le client service-role est passé en paramètre, la garde admin vit dans l'action.
 *
 * L'ORDRE IMPORTE, et chaque étape existe pour une raison mesurée :
 *   0. (appelant) REFUSER si GLA est injoignable — le détachement supprime des lignes qu'on ne
 *      sait reconstruire QU'EN RELISANT GLA ; sans la source, il est définitif ;
 *   1. supprimer les sessions reprises — la cascade emporte fils, messages, notes et axes ;
 *   2. supprimer explicitement les `training_case_bests` des couples DEVENUS VIDES :
 *      `training_refresh_stats` ne touche à rien quand aucune session notée ne subsiste
 *      (`if v_attempts > 0 then …`, 0113:1532). Sans ce nettoyage, le membre garde des « meilleurs
 *      scores » fantômes ;
 *   3. rafraîchir les couples restants, puis le streak. CAS PARTICULIER OBLIGATOIRE : zéro couple
 *      restant ⇒ aucun appel ⇒ l'upsert de `training_profile_stats` (qui vit DANS
 *      `training_refresh_stats`) n'a jamais lieu, et points / moyenne / boss gardent les valeurs de
 *      l'import. La ligne est donc SUPPRIMÉE explicitement ;
 *   4. (appelant) `detached_at = now()` — la ligne `training_legacy_claims` SURVIT.
 */

type Admin = ReturnType<typeof createAdminClient>

export interface LegacyDetachStats {
  /** Sessions reprises supprimées. */
  removed: number
  /** Couples (profil, cas) dont le meilleur score a été effacé faute de session restante. */
  bestsCleared: number
  /** Couples restants rafraîchis (0 = le profil n'avait QUE des sessions reprises). */
  refreshed: number
}

/** Les `case_id` distincts des sessions NOTÉES qui subsistent pour ce profil. */
async function remainingCaseIds(admin: Admin, profileId: string): Promise<Set<string>> {
  const { data, error } = await fetchAll<{ case_id: string }>((f, t) =>
    admin
      .from('training_sessions')
      .select('case_id')
      .eq('profile_id', profileId)
      .eq('status', 'scored')
      .not('total', 'is', null)
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)
  return new Set(data.map((r) => r.case_id))
}

export async function detachLegacySessions(admin: Admin, profileId: string): Promise<LegacyDetachStats> {
  // 1. Les sessions reprises, et elles seules. `legacy_id is not null` est exactement la frontière
  //    posée par 0123 : les sessions jouées ICI ne sont jamais touchées.
  //    Le compte est pris AVANT, par un `head` : un `.delete().select()` ne rendrait que les
  //    1 000 premières lignes (plafond PostgREST) et sous-compterait un gros historique.
  const { count, error: cErr } = await admin
    .from('training_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .not('legacy_id', 'is', null)
  if (cErr) throw new Error(cErr.message)
  const { error: dErr } = await admin
    .from('training_sessions')
    .delete()
    .eq('profile_id', profileId)
    .not('legacy_id', 'is', null)
  if (dErr) throw new Error(dErr.message)

  // 2. Les meilleurs scores devenus orphelins.
  const remaining = await remainingCaseIds(admin, profileId)
  const { data: bests, error: bErr } = await fetchAll<{ case_id: string }>((f, t) =>
    admin.from('training_case_bests').select('case_id').eq('profile_id', profileId).order('case_id').range(f, t),
  )
  if (bErr) throw new Error(bErr.message)
  const orphans = bests.map((b) => b.case_id).filter((id) => !remaining.has(id))
  if (orphans.length > 0) {
    const { error } = await admin
      .from('training_case_bests')
      .delete()
      .eq('profile_id', profileId)
      .in('case_id', orphans)
    if (error) throw new Error(error.message)
  }

  // 3. Recalcul de ce qui reste.
  if (remaining.size === 0) {
    // Plus AUCUNE session notée : `training_refresh_stats` ne serait appelé pour aucun couple, donc
    // son upsert n'aurait jamais lieu et la ligne garderait les points de l'import. On la supprime —
    // `get-me.ts` lit en `maybeSingle()` et retombe sur des zéros.
    const { error } = await admin.from('training_profile_stats').delete().eq('profile_id', profileId)
    if (error) throw new Error(error.message)
    return { removed: count ?? 0, bestsCleared: orphans.length, refreshed: 0 }
  }
  const { data: refreshed, error: rErr } = await admin.rpc('training_legacy_refresh_all', { p_profile: profileId })
  if (rErr) throw new Error(rErr.message)
  await refreshLegacyStreak(admin, profileId)

  return { removed: count ?? 0, bestsCleared: orphans.length, refreshed: refreshed ?? 0 }
}
