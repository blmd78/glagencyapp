import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient, type Database } from '@glagency/db'
import { getPublicEnv } from '@/lib/env'

/**
 * Glue de session pour l'impersonation admin (« consulter/agir en tant que »).
 *
 * Invariants de sécurité (non négociables) :
 * - **Aucun token** ne transite jamais par le cookie d'état ni par la base : le cookie
 *   `imp_sid` ne contient QUE le `sid` (jeton de session OPAQUE = UUID aléatoire, pattern
 *   recommandé quand l'état vit côté serveur ; pas de HMAC, inutile ici — cf. la ligne en
 *   base est la source de vérité, revalidée à chaque lecture) ; la row `impersonation_sessions`
 *   ne stocke QUE des identités + horodatages (audit/TTL).
 * - La vraie session de la cible est forgée dans les cookies Supabase standard
 *   (`sb-*-auth-token`) via un **client SSR dédié non mémoïsé** dont le `setAll` **laisse
 *   remonter** les erreurs (contrairement à `@/lib/supabase/server.ts` qui est `cache()` +
 *   swallow) : un échec d'écriture de cookie DOIT faire échouer le forge (fail-closed).
 * - Le forge n'est validé qu'après `getClaims().sub === expectedUserId` (défense contre un
 *   couple email↔id incohérent).
 * - La révocation utilise le scope **local** (jamais global) : on ne déconnecte que la
 *   session forgée, pas les autres appareils de la cible.
 */

const STATE_COOKIE = 'imp_sid'
const TTL_SECONDS = 1800 // 30 min
const TTL_MS = TTL_SECONDS * 1000

/**
 * Client SSR DÉDIÉ (≠ `@/lib/supabase/server.ts`) : NON mémoïsé (`cache()`) et lié aux
 * cookies MUTABLES de la requête. Son `setAll` **THROW** en cas d'échec — pas de try/catch
 * silencieux : le forge de session doit échouer bruyamment si les cookies ne peuvent être
 * écrits, jamais forger « à moitié ».
 */
async function forgeClient() {
  const store = await cookies()
  const env = getPublicEnv()
  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value, options } of list) store.set(name, value, options)
      },
    },
  })
}

/**
 * Forge la vraie session Supabase de la cible dans les cookies de la réponse.
 * `generateLink('magiclink')` (service-role) → `hashed_token` ; `verifyOtp('magiclink')`
 * sur le client SSR dédié (écrit les cookies de session) ; puis vérifie que le `sub` des
 * claims correspond à `expectedUserId` avant de rendre. Ne logge JAMAIS le `token_hash`
 * ni les tokens.
 */
export async function forgeSessionInto(email: string, expectedUserId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const token_hash = linkData?.properties?.hashed_token
  if (linkError || !token_hash) throw new Error('forge: generateLink failed')

  const client = await forgeClient()
  const { error: verifyError } = await client.auth.verifyOtp({ type: 'magiclink', token_hash })
  if (verifyError) throw new Error('forge: verifyOtp failed')

  const { data } = await client.auth.getClaims()
  if (data?.claims?.sub !== expectedUserId) {
    // Fail-closed : verifyOtp a déjà écrit les cookies de session forgée ; on les retire
    // AVANT de throw (sinon session forgée orpheline = usurpation). imp_sid n'est pas encore
    // posé à cet instant (setStateCookie est appelé par l'appelant APRÈS un forge réussi).
    await client.auth.signOut({ scope: 'local' }).catch(() => {})
    throw new Error('forge: sub mismatch')
  }
}

/**
 * Révoque la session forgée — scope **local** uniquement, best-effort (ne throw jamais :
 * la révocation ne doit pas faire échouer le teardown, qui doit rester idempotent).
 */
export async function revokeForged(accessToken: string): Promise<void> {
  try {
    await createAdminClient().auth.admin.signOut(accessToken, 'local')
  } catch {
    // best-effort : on avale l'erreur pour ne pas casser le teardown.
  }
}

/**
 * Lit l'access token de la session courante (la forgée) depuis les cookies, pour pouvoir la
 * révoquer localement au teardown. Retourne null si aucune session. Pas de log de token.
 */
// À appeler UNIQUEMENT en Server Action / Route Handler : getSession() peut déclencher un
// refresh → écriture cookie (setAll throw hors contexte mutable).
export async function readForgedAccessToken(): Promise<string | null> {
  const client = await forgeClient()
  const { data } = await client.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Pose le cookie d'état `imp_sid` = le `sid` BRUT (jeton opaque). Pas de signature : le `sid`
 * est un UUID aléatoire impossible à deviner/forger, et sa validité est re-vérifiée en base
 * (`getActorForSid` : ligne active + non expirée) à chaque lecture. httpOnly + secure +
 * sameSite=lax. maxAge=8h (> TTL 30 min) : le cookie survit à l'expiration de la row pour que
 * la lecture (dont le filtre `.gt('expires_at')`) détecte « présent mais expiré » → teardown.
 */
export async function setStateCookie(sid: string): Promise<void> {
  const store = await cookies()
  store.set(STATE_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 8 * 3600,
    path: '/',
  })
}

/** Efface le cookie d'état `imp_sid`. */
export async function clearStateCookie(): Promise<void> {
  const store = await cookies()
  store.delete({ name: STATE_COOKIE, path: '/' })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Lit le `sid` (jeton opaque) du cookie d'état, ou null si absent/mal formé. Aucune
 * vérification cryptographique : la validité (session active, non expirée, appartenance) est
 * établie en base par `getActorForSid`/`getRowById`. Le format UUID est juste contrôlé pour
 * éviter d'envoyer une valeur bidon à une requête sur colonne `uuid` (qui lèverait).
 */
export async function readStateCookie(): Promise<string | null> {
  const store = await cookies()
  const sid = store.get(STATE_COOKIE)?.value
  return sid && UUID_RE.test(sid) ? sid : null
}

/**
 * Insère la row d'état (service-role) et retourne son id = `sid`. `expires_at` = +30 min.
 * Aucun token stocké : identités + horodatages uniquement (audit / TTL).
 */
export async function createRow(
  actor: { id: string; email: string },
  target: { id: string; email: string },
): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('impersonation_sessions')
    .insert({
      actor_id: actor.id,
      target_id: target.id,
      actor_email: actor.email,
      target_email: target.email,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createRow: ${error?.message ?? 'no row returned'}`)
  return data.id
}

/** Clôt la row (pose `ended_at = now()`), uniquement si encore active. Idempotent. */
export async function endRow(sid: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sid)
    .is('ended_at', null)
  if (error) throw new Error(`endRow: ${error.message}`)
}

/**
 * Lit la row ACTIVE (`ended_at is null` ET non expirée) par id. Retourne l'acteur/cible, ou
 * null si absente/close/EXPIRÉE/erreur (fail-closed côté garde/tripwire). Le filtre
 * `.gt('expires_at', now)` rend le TTL 30 min AUTORITATIF côté serveur (pas seulement le
 * cookie) : passé l'expiration, la row n'est plus « active » → le tripwire force le teardown.
 * (Le teardown lui-même passe par `getRowById`, sans filtre d'expiration → clôture quand même.)
 */
export async function getActorForSid(
  sid: string,
): Promise<{ actorId: string; targetId: string; expiresAt: string } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('impersonation_sessions')
    .select('actor_id, target_id, expires_at')
    .eq('id', sid)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error || !data) return null
  return { actorId: data.actor_id, targetId: data.target_id, expiresAt: data.expires_at }
}

/**
 * Lit la row par id SANS filtrer `ended_at`, en distinguant `ended` (déjà clôturée) de
 * `null` (absente/panne). Utilisé par `performStop` pour rendre le teardown IDEMPOTENT : une
 * row « déjà clôturée » (course avec l'expiration ou un autre `/stop`) ne doit PAS déclencher
 * `fullLogout` (la restauration admin a déjà eu lieu) — seule une row absente/panne le doit.
 */
export async function getRowById(
  sid: string,
): Promise<{ actorId: string; actorEmail: string; targetId: string; ended: boolean } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('impersonation_sessions')
    .select('actor_id, actor_email, target_id, ended_at')
    .eq('id', sid)
    .maybeSingle()
  if (error || !data) return null
  return {
    actorId: data.actor_id,
    actorEmail: data.actor_email,
    targetId: data.target_id,
    ended: data.ended_at !== null,
  }
}
