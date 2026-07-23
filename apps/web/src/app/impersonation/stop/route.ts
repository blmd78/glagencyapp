import { redirect } from 'next/navigation'
import { performStop } from '@/lib/impersonation/teardown'

/**
 * Point d'entrée du teardown déclenché par **redirection serveur** : `getImpersonationState`
 * redirige ici quand la row d'impersonation n'est plus active/non-expirée (TTL en base) alors
 * que le cookie `imp_sid` survit encore (maxAge 8h > TTL 30 min).
 *
 * Runtime node (défaut des Route Handlers, non déclaré : incompatible avec cacheComponents) —
 * requis car performStop touche la DB (Supabase admin) + le re-mint de session.
 */

export async function GET() {
  await performStop()
  redirect('/chatter/members')
}
