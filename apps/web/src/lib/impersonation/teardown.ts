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
 * `getRowById(sid)` (sans filtre, pour distinguer `ended` de `absente`) → re-mint admin
 * (`row.actorId`) → assert rôle admin/superadmin BRUT → révocation locale du forgé → clôture
 * row → clear cookie → Sentry. **Toute** anomalie (row introuvable/`null`, acteur non-admin,
 * forge KO) bascule sur `fullLogout()` : une session forgée ne doit jamais survivre. Le
 * nettoyage n'est JAMAIS conditionné à un lookup réussi.
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

    // Note sécu : l'escalade admin→superadmin (un admin rejouant le `sid` d'un autre pour
    // re-minter sa session) est fermée par la RLS `0083` — la table n'est plus lisible par les
    // `authenticated`, donc le `sid` d'autrui n'est jamais récupérable. On NE remet PAS de garde
    // « porteur === cible » côté app : elle était fragile (lecture de session flaky → déloge le
    // vrai utilisateur) ET imparfaite (trou « même cible »). Défense-en-profondeur possible mais
    // PROPRE = contrainte DB « une impersonation active par cible » (à ajouter si besoin).
    // Re-mint la session admin depuis l'email STOCKÉ dans la row (posé au start) — pas de
    // getUserById(actorId) : cet appel externe échouait par intermittence → le teardown
    // retombait sur fullLogout = déloge l'admin. L'email stocké est fiable.
    const admin = createAdminClient()
    if (!row.actorEmail) throw new Error('actor email manquant')

    // Re-mint la session admin (assert sub===actorId à l'intérieur du forge).
    await forgeSessionInto(row.actorEmail, row.actorId)

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
  } catch (e) {
    // Fallback fail-closed : tuer le forgé (best-effort) + logout total. Réservé aux vrais
    // échecs (row absente/panne, porteur ≠ cible, admin sans email, forge KO, acteur non-admin).
    // On trace la CAUSE (sans token) : un teardown qui déloge est anormal côté UX, on doit savoir.
    Sentry.captureMessage('impersonate:teardown-fallback', {
      level: 'warning',
      extra: { reason: e instanceof Error ? e.message : String(e) },
    })
    if (forged) await revokeForged(forged).catch(() => {})
    await fullLogout()
  }
}
