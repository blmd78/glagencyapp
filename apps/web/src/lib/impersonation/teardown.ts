import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@glagency/db'
import {
  forgeSessionInto,
  revokeForged,
  readForgedAccessToken,
  clearStateCookie,
  readStateCookie,
  endRow,
  getActorForSid,
} from '@/lib/impersonation/session'

/**
 * Teardown partagé de l'impersonation admin (« consulter/agir en tant que »).
 *
 * Runtime **NODE uniquement** : `performStop`/`fullLogout` touchent `node:crypto`
 * (`verifyState` via `readStateCookie`) et la DB (Supabase admin). À n'appeler QUE depuis
 * une Server Action (`stopImpersonation`) ou un Route Handler (`/impersonation/stop`) — jamais
 * depuis le proxy EDGE.
 *
 * Ce module n'est **pas** `'use server'` : `performStop`/`fullLogout` ne sont PAS des Server
 * Actions exposées au client, juste des helpers serveur partagés entre l'action et la route.
 */

/**
 * Teardown fail-closed « dernier recours » : efface TOUS les cookies d'auth Supabase
 * (`sb-*`) + le cookie d'état `imp_sid`. Ne throw jamais (best-effort) — une session forgée
 * ne doit JAMAIS survivre à un échec de restauration, même si l'audit/DB est en panne.
 */
export async function fullLogout(): Promise<void> {
  try {
    const store = await cookies()
    for (const c of store.getAll()) {
      if (c.name.startsWith('sb-')) store.delete({ name: c.name, path: '/' })
    }
  } catch {
    /* best-effort : ne throw jamais */
  }
  await clearStateCookie().catch(() => {})
}

/**
 * Arrête la consultation et restaure la session admin. Point d'entrée unique du teardown,
 * partagé par `stopImpersonation` (action) et le Route Handler `/impersonation/stop`
 * (redirection déclenchée à l'expiration).
 *
 * Snapshot du token forgé AVANT toute restauration (sinon on ne peut plus le révoquer) →
 * re-mint admin depuis `getActorForSid(sid).actorId` (assert `sub === actorId` dans
 * `forgeSessionInto`) → assert rôle admin/superadmin BRUT → révocation locale du forgé →
 * clôture row → clear cookie → Sentry. **Toute** anomalie (row introuvable/`null` de panne
 * DB, acteur non-admin, forge KO) bascule sur `fullLogout()` : une session forgée ne doit
 * jamais survivre. Le nettoyage n'est JAMAIS conditionné à un lookup réussi.
 */
export async function performStop(): Promise<void> {
  const state = await readStateCookie()
  if (!state) {
    // Pas d'état : rien à restaurer, mais on garantit une sortie propre.
    await fullLogout()
    return
  }

  // Snapshot du token forgé AVANT toute restauration (déclaré hors du try pour que le
  // fallback puisse le révoquer). Toute panne en aval retombe sur fullLogout (fail-closed).
  let forged: string | null = null
  try {
    forged = await readForgedAccessToken()

    // ⚠️ NE PAS conditionner le nettoyage à une row : `null` (panne DB) est indistinguable
    // de « pas de row ». Un null → on throw → fallback fullLogout (session forgée tuée).
    const row = await getActorForSid(state.sid)
    if (!row) throw new Error('row introuvable')

    const admin = createAdminClient()
    const { data: au } = await admin.auth.admin.getUserById(row.actorId)
    if (!au?.user?.email) throw new Error('admin sans email')

    // Re-mint la session admin (assert sub===actorId à l'intérieur du forge).
    await forgeSessionInto(au.user.email, row.actorId)

    // Assert : l'acteur restauré est bien admin/superadmin (rôle BRUT), sinon fallback.
    const { data: prof } = await admin
      .from('profiles')
      .select('role')
      .eq('id', row.actorId)
      .single()
    if (prof?.role !== 'admin' && prof?.role !== 'superadmin') {
      throw new Error('acteur non-admin')
    }

    // Révoque la session forgée (locale, best-effort) puis clôt l'audit + le cookie.
    if (forged) await revokeForged(forged)
    await endRow(state.sid)
    await clearStateCookie()
    Sentry.captureMessage('impersonate:stop', {
      level: 'info',
      extra: { actor_id: row.actorId },
    })
  } catch {
    // Fallback fail-closed : tuer le forgé (best-effort) + logout total. TOUJOURS, même
    // si `row` était null (panne DB indistinguable de « pas de row »).
    if (forged) await revokeForged(forged).catch(() => {})
    await fullLogout()
  }
}
