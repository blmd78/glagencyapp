import type { createAdminClient } from '@glagency/db'
import { readCookie, rememberMeLogin, verifySession } from '@glagency/mypuls'

/**
 * Session MyPuls de l'import de scripts — une 2e ligne de `ingest_session` (service role seul, 0109),
 * DISTINCTE de celle du relevé de nuit : changer de modèle (`switchCreator`) dans l'une ne bouscule
 * pas l'autre. Série « remember me » à elle : amorcée une fois par un login humain (Turnstile), puis
 * vérifiée à chaque envoi et gardée en vie chaque nuit par le Worker (expiration glissante de 7 j).
 * Aucun import du SDK Anthropic ici : le Worker importe ce module.
 */
export const SCRIPTS_SESSION_ID = 'scripts'

export interface SessionStore {
  read(): Promise<{ cookie: string; refreshedAt: string } | null>
  write(cookie: string): Promise<void>
}
export interface SessionDeps {
  rememberMeLogin: typeof rememberMeLogin
  readCookie: typeof readCookie
  verifySession: typeof verifySession
}
const DEFAULT_DEPS: SessionDeps = { rememberMeLogin, readCookie, verifySession }

type Db = ReturnType<typeof createAdminClient>
export function ingestSessionStore(db: Db, id: string): SessionStore {
  return {
    async read() {
      const { data, error } = await db.from('ingest_session' as never).select('cookie, refreshed_at').eq('id', id).maybeSingle()
      if (error) throw new Error(`ingest_session lecture : ${error.message}`)
      const row = data as { cookie?: string; refreshed_at?: string } | null
      return row?.cookie ? { cookie: row.cookie, refreshedAt: row.refreshed_at ?? new Date(0).toISOString() } : null
    },
    async write(cookie) {
      const { error } = await db
        .from('ingest_session' as never)
        .upsert({ id, cookie, refreshed_at: new Date().toISOString() } as never, { onConflict: 'id' })
      if (error) throw new Error(`ingest_session écriture : ${error.message}`)
    },
  }
}

/** Session absente ou expirée : issue attendue, qui se règle en recollant un cookie (pas une panne). */
export class ScriptsSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptsSessionError'
  }
}

const EXPIRED =
  'Session MyPuls « scripts » expirée : recolle un cookie frais dans MYPULS_SCRIPTS_SESSION_COOKIE (Vercel), puis redéploie.'

/** Renouvelle par le REMEMBERME et enregistre le cookie frais. */
async function renew(store: SessionStore, cookie: string, deps: SessionDeps): Promise<string> {
  const remember = deps.readCookie(cookie, 'REMEMBERME')
  if (!remember) throw new ScriptsSessionError(EXPIRED)
  const fresh = await deps.rememberMeLogin(remember)
  await store.write(fresh.cookie)
  return fresh.cookie
}

/**
 * Session pour un envoi : VÉRIFIÉE d'abord, renouvelée seulement si elle est morte. Un import ne fait
 * donc pas tourner le REMEMBERME pendant que le Worker pourrait le faire (pas de fenêtre de nuit à
 * respecter) — et un PHPSESSID déjà en main reste valide si le REMEMBERME tourne entre-temps.
 */
export async function scriptsSessionForSend(store: SessionStore, seed?: string, deps: SessionDeps = DEFAULT_DEPS): Promise<string> {
  const row = await store.read()
  const fresh = seed?.trim() || null
  const cookie = row?.cookie ?? fresh
  if (!cookie) {
    throw new ScriptsSessionError('Session MyPuls « scripts » absente : colle un cookie dans MYPULS_SCRIPTS_SESSION_COOKIE (Vercel), puis redéploie.')
  }
  if (await deps.verifySession(cookie)) {
    // Amorçage encore valide : on l'enregistre, sinon la garde de nuit (« absente ») ne le prendrait
    // jamais en charge et il expirerait avec son REMEMBERME.
    if (!row) await store.write(cookie)
    return cookie
  }
  try {
    return await renew(store, cookie, deps)
  } catch (e) {
    // Ligne enregistrée irrécupérable : un NOUVEL amorçage (cookie recollé dans la variable) la
    // remplace — sinon la ligne morte masquerait la variable et le réamorçage serait impossible.
    if (row && fresh && fresh !== row.cookie) {
      if (await deps.verifySession(fresh)) {
        await store.write(fresh)
        return fresh
      }
      return renew(store, fresh, deps).catch(() => {
        throw new ScriptsSessionError(EXPIRED)
      })
    }
    if (e instanceof ScriptsSessionError) throw e
    throw new ScriptsSessionError(EXPIRED)
  }
}

const KEEPALIVE_AFTER_MS = 12 * 3_600_000

/** Garde en vie nocturne (Worker) : rien tant que l'import n'est pas amorcé, ni si la session a moins de 12 h. */
export async function keepScriptsSessionAlive(
  store: SessionStore,
  now: Date = new Date(),
  deps: SessionDeps = DEFAULT_DEPS,
): Promise<'absente' | 'récente' | 'renouvelée'> {
  const row = await store.read()
  if (!row) return 'absente'
  if (now.getTime() - new Date(row.refreshedAt).getTime() < KEEPALIVE_AFTER_MS) return 'récente'
  await renew(store, row.cookie, deps)
  return 'renouvelée'
}
