import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@glagency/db'
import {
  forgeSessionInto,
  revokeForged,
  readForgedAccessToken,
  getCurrentSub,
  clearStateCookie,
  readStateCookie,
  endRow,
  getRowById,
} from '@/lib/impersonation/session'

/**
 * Teardown partagé de l'impersonation admin (« consulter/agir en tant que »).
 *
 * Runtime **NODE uniquement** : `performStop` touche la DB (Supabase admin) + le re-mint de
 * session (`forgeSessionInto`). À n'appeler QUE depuis une Server Action (`stopImpersonation`)
 * ou un Route Handler (`/impersonation/stop`) — jamais depuis le proxy EDGE.
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
 * `getRowById(sid)` (sans filtre, pour distinguer `ended` de `absente`) → vérif porteur
 * (`sub === target_id`, anti-rejeu d'un sid volé) → re-mint admin (`row.actorId`) → assert
 * rôle admin/superadmin BRUT → révocation locale du forgé → clôture row → clear cookie →
 * Sentry. **Toute** anomalie (row introuvable/`null`, porteur ≠ cible, acteur non-admin, forge
 * KO) bascule sur `fullLogout()` : une session forgée ne doit jamais survivre. Le nettoyage
 * n'est JAMAIS conditionné à un lookup réussi.
 */
export async function performStop(): Promise<void> {
  const sid = await readStateCookie()
  if (!sid) {
    // Pas d'état : aucune impersonation en cours, rien à restaurer — no-op. Ne PAS appeler
    // fullLogout() ici : ça déconnecterait un utilisateur courant qui n'impersonne pas
    // (ex. navigation vers /impersonation/stop sans état actif).
    return
  }

  // Snapshot du token forgé AVANT toute restauration (déclaré hors du try pour que le
  // fallback puisse le révoquer). Toute panne en aval retombe sur fullLogout (fail-closed).
  let forged: string | null = null
  try {
    forged = await readForgedAccessToken()

    // On lit la row SANS filtrer ended_at, pour distinguer deux cas très différents :
    //   • row absente (null) → sid inconnu / panne DB → fail-closed → fullLogout.
    //   • row DÉJÀ clôturée (ended) → une course (rafale d'expiration du compteur ou double
    //     /stop) a déjà fait le teardown ET restauré l'admin → IDEMPOTENT : on efface juste le
    //     cookie, JAMAIS fullLogout (sinon on détruit la session admin fraîchement restaurée →
    //     c'était LE bug « Quitter/expiration me déconnecte »).
    const row = await getRowById(sid)
    if (!row) throw new Error('row introuvable')

    if (row.ended) {
      if (forged) await revokeForged(forged)
      await clearStateCookie()
      return
    }

    // ⚠️ Lien porteur↔session : la session COURANTE doit être la CIBLE de cette row. Sinon, un
    // admin qui aurait rejoué le `sid` d'un autre (le cookie opaque n'est pas lié cryptographi-
    // quement au porteur) obtiendrait, via le re-mint ci-dessous, la session de `row.actorId`
    // (= escalade). Placé APRÈS `row.ended` (idempotence préservée) : on ne re-minte l'acteur
    // QUE pour le vrai impersonateur. Mismatch → fail-closed (throw → catch → fullLogout).
    const currentSub = await getCurrentSub()
    if (currentSub !== row.targetId) throw new Error('bearer mismatch: session courante ≠ cible')

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
    // `endRow` est idempotent (`.is('ended_at', null)`) : deux /stop concurrents sur une row
    // active re-mintent tous deux l'admin (sûr) et seul le premier pose `ended_at`.
    if (forged) await revokeForged(forged)
    await endRow(sid)
    await clearStateCookie()
    Sentry.captureMessage('impersonate:stop', {
      level: 'info',
      extra: { actor_id: row.actorId },
    })
  } catch {
    // Fallback fail-closed : tuer le forgé (best-effort) + logout total. Réservé aux vrais
    // échecs (row absente/panne, admin sans email, forge KO, acteur non-admin) — plus jamais
    // déclenché par une row « déjà clôturée » (traitée en idempotent ci-dessus).
    if (forged) await revokeForged(forged).catch(() => {})
    await fullLogout()
  }
}
