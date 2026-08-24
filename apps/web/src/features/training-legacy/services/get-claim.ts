import { createClient } from '@/lib/supabase/server'
import type { LegacyClaimState } from '../types'

/**
 * L'état de rattachement du VISITEUR, lu sous RLS (`training_legacy_claims_read` : le
 * propriétaire, l'encadrant `frm-suivi`, l'admin). Le `.eq('profile_id', …)` explicite est ce qui
 * rend la lecture « mienne » — la policy s'ouvre au-delà du propriétaire.
 *
 * `null` = rien à afficher d'autre que l'encart d'appel. Un rattachement DÉTACHÉ (`detachedAt`)
 * est rendu tel quel : c'est le composant qui décide de remontrer l'appel — l'information « ce
 * profil a déjà eu un rattachement » reste utile à qui lit.
 */
export async function getLegacyClaim(profileId: string): Promise<LegacyClaimState | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('training_legacy_claims')
    .select('login_display, claimed_at, last_sync_at, sync_started_at, sessions_count, detached_at')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    loginDisplay: data.login_display,
    claimedAt: data.claimed_at,
    lastSyncAt: data.last_sync_at,
    syncStartedAt: data.sync_started_at,
    // Même fenêtre que `training_legacy_claim_begin` (5 min) : au-delà, l'import est réputé mort et
    // « Reprendre » redevient possible. Décidé ICI, sur le serveur, pour que le composant n'ait
    // aucune décision dépendante de l'horloge à prendre au rendu.
    syncing: data.sync_started_at != null && Date.now() - Date.parse(data.sync_started_at) < 5 * 60_000,
    sessionsCount: data.sessions_count,
    detachedAt: data.detached_at,
  }
}
