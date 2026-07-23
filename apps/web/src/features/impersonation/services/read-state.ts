import { redirect } from 'next/navigation'
import { isImpersonatable } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { readStateCookie, getActorForSid } from '@/lib/impersonation/session'

/**
 * État d'impersonation courant, pour le bandeau (Task 7).
 *
 * Server-only. Coût nul hors impersonation : sans cookie `imp_sid`, aucun accès DB — c'est
 * appelé sur CHAQUE navigation via le layout `(dash)`, donc doit rester quasi gratuit pour
 * le cas commun (pas de consultation en cours).
 *
 * Deux gardes redirigent vers `/impersonation/stop` (teardown, cf. `performStop`) :
 * - **Expiration / session close** : `getActorForSid` ne renvoie une ligne que si elle est
 *   active ET non expirée (filtre `.gt('expires_at')` = TTL 30 min autoritatif en base) ;
 *   `null` → teardown. Le cookie (maxAge 8h) survit à la row pour permettre cette détection.
 * - **Tripwire** : la cible a été promue admin/superadmin pendant la session (ou son profil
 *   a disparu) — re-vérifiée à CHAQUE appel sur le rôle BRUT (jamais mise en cache).
 *
 * `redirect()` doit être appelé en contexte Server Component (jamais avalé par un
 * try/catch) : `NEXT_REDIRECT` doit remonter tel quel.
 */
export type ImpersonationState = {
  active: boolean
  targetName?: string
  expiresAt?: number
}

export async function getImpersonationState(): Promise<ImpersonationState> {
  const sid = await readStateCookie()
  if (!sid) return { active: false }

  // Ligne active + non expirée (TTL en base). null → session absente/close/expirée → teardown.
  const row = await getActorForSid(sid)
  if (!row) redirect('/impersonation/stop')

  // Tripwire : rôle BRUT de la cible re-vérifié à chaque appel (jamais le rôle collapsé).
  const { data } = await createAdminClient()
    .from('profiles')
    .select('role, display_name')
    .eq('id', row.targetId)
    .single()
  if (!data || !isImpersonatable(data.role)) redirect('/impersonation/stop')

  return {
    active: true,
    targetName: data.display_name ?? '—',
    expiresAt: new Date(row.expiresAt).getTime(),
  }
}
