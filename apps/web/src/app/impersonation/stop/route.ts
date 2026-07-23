import { redirect } from 'next/navigation'
import { performStop } from '@/features/impersonation/teardown'

/**
 * Point d'entrée du teardown déclenché par **redirection serveur** : la détection
 * d'expiration côté node (Task 7, `getImpersonationState`) redirige ici quand le cookie
 * `imp_sid` est « expiré mais présent » (son `exp` logique est dépassé alors que le cookie
 * survit — cf. `setStateCookie`, maxAge > exp).
 *
 * Runtime **node** (défaut des Route Handlers) : requis car `performStop` touche `node:crypto`
 * (`verifyState`) + Supabase admin — la logique crypto/DB ne doit jamais tourner en EDGE.
 */
export const runtime = 'nodejs'

export async function GET() {
  await performStop()
  redirect('/chatter/members')
}
