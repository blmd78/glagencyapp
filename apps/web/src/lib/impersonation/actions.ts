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
import { performStop } from '@/lib/impersonation/teardown'

/**
 * Server Actions d'impersonation admin (« consulter/agir en tant que »).
 *
 * Toutes les défenses se rejoignent ici : gardes fail-closed, forge de la session cible
 * (rollback sur échec), re-mint de la session admin et révocation au teardown. Invariant
 * absolu : **aucun token** ne sort jamais du helper de session ni ne part dans Sentry.
 *
 * Navigation : `startImpersonation` NE redirige PAS côté serveur (le swap de session casse
 * une navigation RSC → « unexpected response ») — il renvoie l'`ActionResult` et le bouton fait
 * une navigation DURE (`window.location`) sur succès. `stopImpersonation`, lui, redirige, mais
 * **HORS** `runAction` (piège Next.js : `runAction` tourne sous try/catch Sentry qui avalerait
 * le `NEXT_REDIRECT` → faux exception + navigation muette) et via un form-action (nav pleine page).
 */

/**
 * Démarre une consultation « en tant que » la cible `targetId`.
 *
 * Ordre strict (fail-closed) : garde appelant (admin) → re-vérif rôle → no-nesting →
 * rôle BRUT de la cible (allowlist) → résolution email confirmé par id → email admin (pour
 * le re-mint de sortie) → row d'audit → forge (rollback si échec) → cookie d'état → Sentry.
 * Renvoie l'`ActionResult` (pas de redirect serveur — cf. note en tête de fichier).
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

      // (5) Résolution de la cible par id : email COURANT requis (pour forger via generateLink).
      // On N'EXIGE PAS email_confirmed_at : un membre créé mais jamais connecté a un email non
      // confirmé, et le magiclink de la forge le confirme de toute façon. Seul l'email doit exister.
      const { data: tu } = await admin.auth.admin.getUserById(id)
      const targetEmail = tu?.user?.email
      if (!targetEmail) throw new BusinessError('Compte cible sans email')

      // (6) Email admin (pour le re-mint à la sortie + audit de la row).
      const { data: au } = await admin.auth.admin.getUserById(caller.id)
      const adminEmail = au?.user?.email
      if (!adminEmail) throw new BusinessError('Compte admin sans email')

      // (7) Row d'audit (aucun token stocké).
      const sid = await createRow({ id: caller.id, email: adminEmail }, { id, email: targetEmail })

      // (8) Forge la session cible + (9) pose le cookie d'état, dans le MÊME try : rollback
      // complet si l'un échoue (re-mint admin best-effort + ferme la row), sinon un échec de
      // setStateCookie après un forge réussi laisserait une session forgée orpheline (sans
      // imp_sid). Le cookie = le `sid` opaque (UUID), non signé — validité re-vérifiée en base.
      try {
        await forgeSessionInto(targetEmail, id)
        await setStateCookie(sid)
      } catch {
        await forgeSessionInto(adminEmail, caller.id).catch(() => {})
        await endRow(sid).catch(() => {})
        throw new BusinessError('Impossible de démarrer la consultation')
      }

      // (10) audit Sentry (jamais de token).
      Sentry.captureMessage('impersonate:start', {
        level: 'info',
        extra: { actor_id: caller.id, target_id: id },
      })
    },
  })

  // (11) PAS de redirect serveur ici : le start a échangé la session (cookies), et une
  // navigation RSC (soft) après ce swap échoue côté client (« An unexpected response was
  // received from the server »). On renvoie le résultat ; le bouton fait une navigation DURE
  // (window.location) sur succès — équivalent d'un refresh, qui lui fonctionne.
  return result
}

/**
 * Arrête la consultation et restaure la session admin. Le teardown (fail-closed, idempotent,
 * vérif du porteur) vit dans `performStop` (`teardown.ts`) — voir sa doc. On redirige toujours
 * vers Membres ensuite.
 */
export async function stopImpersonation(): Promise<void> {
  // Le teardown vit dans `teardown.ts` (`performStop`), partagé avec le Route Handler
  // `/impersonation/stop`. On le garde sous `runAction` pour la parité de contrat (try/catch
  // Sentry) ; `performStop` est déjà fail-closed en interne (fullLogout).
  await runAction({
    schema: z.void(),
    input: undefined,
    guard: async () => ({ ok: true as const }),
    handler: async () => {
      await performStop()
    },
  })

  // Redirection HORS runAction. Inconditionnelle : succès → session admin restaurée ; échec
  // → fullLogout a déconnecté (la page Membres renverra alors vers /login). Voir note en tête.
  redirect('/chatter/members')
}
