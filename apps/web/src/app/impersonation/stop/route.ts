import { redirect } from 'next/navigation'
import { performStop } from '@/lib/impersonation/teardown'

/**
 * Point d'entrée du teardown déclenché par **redirection serveur** : la détection
 * d'expiration côté node (Task 7, `getImpersonationState`) redirige ici quand le cookie
 * `imp_sid` est « expiré mais présent » (son `exp` logique est dépassé alors que le cookie
 * survit — cf. `setStateCookie`, maxAge > exp).
 *
 * Runtime node (défaut des Route Handlers, non déclaré : incompatible avec cacheComponents) —
 * requis car performStop touche node:crypto + Supabase admin.
 */

export async function GET() {
  await performStop()
  redirect('/chatter/members')
}
