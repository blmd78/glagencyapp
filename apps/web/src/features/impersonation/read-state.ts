import { redirect } from 'next/navigation'
import { isExpired, isImpersonatable } from '@glagency/core'
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
 * - **Expiration** : `exp` (TTL logique 30 min) dépassé alors que le cookie survit encore
 *   (maxAge 8h, cf. `setStateCookie`) — c'est précisément ce décalage qui permet de détecter
 *   l'expiration ici plutôt que de compter sur l'expiration du cookie lui-même.
 * - **Tripwire** : la cible a été promue admin/superadmin pendant la session (ou son profil
 *   a disparu) — re-vérifiée à CHAQUE appel sur le rôle BRUT (jamais mise en cache).
 *
 * `redirect()` doit être appelé en contexte Server Component (jamais avalé par un
 * try/catch) : `NEXT_REDIRECT` doit remonter tel quel.
 */
export async function getImpersonationState(): Promise<{
  active: boolean
  targetName?: string
  expiresAt?: number
}> {
  const state = await readStateCookie()
  if (!state) return { active: false }

  if (isExpired(state.exp, Date.now())) redirect('/impersonation/stop')

  const row = await getActorForSid(state.sid)
  if (!row) redirect('/impersonation/stop')

  // Tripwire : rôle BRUT de la cible re-vérifié à chaque appel (jamais le rôle collapsé).
  const { data } = await createAdminClient()
    .from('profiles')
    .select('role, display_name')
    .eq('id', row.targetId)
    .single()
  if (!data || !isImpersonatable(data.role)) redirect('/impersonation/stop')

  return { active: true, targetName: data.display_name ?? '—', expiresAt: state.exp }
}
