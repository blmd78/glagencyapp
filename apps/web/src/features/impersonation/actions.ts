'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { isImpersonatable } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { getProfile } from '@/lib/auth'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'
import {
  forgeSessionInto,
  revokeForged,
  readForgedAccessToken,
  setStateCookie,
  clearStateCookie,
  readStateCookie,
  createRow,
  endRow,
  getActorForSid,
} from '@/lib/impersonation/session'

/**
 * Server Actions d'impersonation admin (« consulter/agir en tant que »).
 *
 * Toutes les défenses se rejoignent ici : gardes fail-closed, forge de la session cible
 * (rollback sur échec), re-mint de la session admin et révocation au teardown. Invariant
 * absolu : **aucun token** ne sort jamais du helper de session ni ne part dans Sentry.
 *
 * ⚠️ `redirect()` est appelé **HORS** `runAction` (piège Next.js documenté dans
 * `features/members/authz.ts` : `runAction` tourne sous try/catch Sentry, qui avalerait le
 * `NEXT_REDIRECT` et le transformerait en erreur générique — la navigation ne se ferait pas
 * et Sentry recevrait un faux exception à CHAQUE start/stop). Le handler fait tout le travail
 * gardé et renvoie ; la redirection est déclenchée ensuite, sur le résultat.
 */

/**
 * Teardown fail-closed « dernier recours » : efface TOUS les cookies d'auth Supabase
 * (`sb-*`) + le cookie d'état `imp_sid`. Ne throw jamais (best-effort) — une session forgée
 * ne doit JAMAIS survivre à un échec de restauration, même si l'audit/DB est en panne.
 */
async function fullLogout(): Promise<void> {
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
 * Démarre une consultation « en tant que » la cible `targetId`.
 *
 * Ordre strict (fail-closed) : garde appelant (admin) → re-vérif rôle → no-nesting →
 * rôle BRUT de la cible (allowlist) → résolution email confirmé par id → email admin (pour
 * le re-mint de sortie) → row d'audit → forge (rollback si échec) → cookie d'état → Sentry.
 * `redirect('/')` n'a lieu qu'en cas de succès (voir note en tête de fichier).
 */
export async function startImpersonation(targetId: string): Promise<ActionResult> {
  const result = await runAction({
    schema: z.uuid(),
    input: targetId,
    guard: adminGuard,
    handler: async (id) => {
      // (2) Défense en profondeur : l'appelant DOIT rester admin/superadmin.
      const caller = await getProfile()
      if (!caller || caller.role !== 'admin') throw new BusinessError('Accès refusé')

      // (3) No-nesting : jamais d'impersonation imbriquée.
      if (await readStateCookie()) throw new BusinessError('Déjà en consultation')

      const admin = createAdminClient()

      // (4) Cible fail-closed sur le rôle BRUT (jamais le rôle collapsé de getProfile) :
      // seuls les rôles non-admin (allowlist `isImpersonatable`) sont consultables.
      const { data: prof } = await admin.from('profiles').select('role').eq('id', id).single()
      if (!isImpersonatable(prof?.role)) throw new BusinessError('Membre non consultable')

      // (5) Résolution de la cible par id : email COURANT + confirmé exigés.
      const { data: tu } = await admin.auth.admin.getUserById(id)
      const targetUser = tu?.user
      if (!targetUser?.email || !targetUser.email_confirmed_at) {
        throw new BusinessError('Compte cible sans email confirmé')
      }
      const targetEmail = targetUser.email

      // (6) Email admin (pour le re-mint à la sortie + audit de la row).
      const { data: au } = await admin.auth.admin.getUserById(caller.id)
      const adminEmail = au?.user?.email
      if (!adminEmail) throw new BusinessError('Compte admin sans email')

      // (7) Row d'audit (aucun token stocké).
      const sid = await createRow({ id: caller.id, email: adminEmail }, { id, email: targetEmail })

      // (8) Forge la session cible dans les cookies. Rollback complet si échec :
      // re-mint la session admin (best-effort) + ferme la row, puis erreur métier.
      try {
        await forgeSessionInto(targetEmail, id)
      } catch {
        await forgeSessionInto(adminEmail, caller.id).catch(() => {})
        await endRow(sid).catch(() => {})
        throw new BusinessError('Impossible de démarrer la consultation')
      }

      // (9) Cookie d'état signé (30 min) + (10) audit Sentry (jamais de token).
      await setStateCookie(sid, Date.now() + 30 * 60_000)
      Sentry.captureMessage('impersonate:start', {
        level: 'info',
        extra: { actor_id: caller.id, target_id: id },
      })
    },
  })

  // (11) Redirection HORS runAction : uniquement si tout a réussi.
  if (result.success) redirect('/')
  return result
}

/**
 * Arrête la consultation et restaure la session admin.
 *
 * Snapshot du token forgé AVANT toute restauration (sinon on ne peut plus le révoquer) →
 * re-mint admin (assert `sub === actorId` dans `forgeSessionInto`) → assert rôle admin BRUT →
 * révocation locale du forgé → clôture row → clear cookie → Sentry. **Toute** anomalie (row
 * introuvable/`null` de panne DB, acteur non-admin, forge KO) bascule sur `fullLogout()` :
 * une session forgée ne doit jamais survivre. On redirige toujours vers Membres ensuite.
 */
export async function stopImpersonation(): Promise<ActionResult> {
  const result = await runAction({
    schema: z.void(),
    input: undefined,
    guard: async () => ({ ok: true as const }),
    handler: async () => {
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
    },
  })

  // Redirection HORS runAction. Inconditionnelle : succès → session admin restaurée ; échec
  // → fullLogout a déconnecté (la page Membres renverra alors vers /login). Voir note en tête.
  void result
  redirect('/chatter/members')
}
