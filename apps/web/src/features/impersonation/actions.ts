'use server'

import { redirect } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { isImpersonatable } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { getProfile } from '@/lib/auth'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'
import {
  forgeSessionInto,
  setStateCookie,
  readStateCookie,
  createRow,
  endRow,
} from '@/lib/impersonation/session'
import { performStop } from '@/features/impersonation/teardown'

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
  // Le teardown vit dans `teardown.ts` (`performStop`), partagé avec le Route Handler
  // `/impersonation/stop`. On le garde sous `runAction` pour la parité de contrat (try/catch
  // Sentry + `ActionResult`) ; `performStop` est déjà fail-closed en interne (fullLogout).
  const result = await runAction({
    schema: z.void(),
    input: undefined,
    guard: async () => ({ ok: true as const }),
    handler: async () => {
      await performStop()
    },
  })

  // Redirection HORS runAction. Inconditionnelle : succès → session admin restaurée ; échec
  // → fullLogout a déconnecté (la page Membres renverra alors vers /login). Voir note en tête.
  void result
  redirect('/chatter/members')
}
