import { rememberMeLogin, readCookie, verifySession } from '@glagency/mypuls'
import type { createAdminClient } from '@glagency/db'

type Db = ReturnType<typeof createAdminClient>

// Une seule ligne dans ingest_session (migration 0109) : la session MyPuls courante.
const SESSION_ID = 'mypuls'

/**
 * Gestion de la session MyPuls AUTO-RENOUVELÉE (remember-me glissant, cf. 0109).
 *
 * Le cookie vit dans la table `ingest_session` (mutable, contrairement à un secret figé).
 * `refreshCookie()` — appelé UNE FOIS en tête de chaque run — se ré-authentifie via le
 * REMEMBERME stocké, obtient un PHPSESSID + REMEMBERME frais (expiration +7 j) et le réécrit.
 * `loadCookie()` — lit la valeur courante sans ré-auth (fan-out : les mini-invocations
 * réutilisent le cookie déjà rafraîchi par l'orchestrateur, sans re-déclencher la rotation).
 *
 * Amorçage : si la table est vide, on sème depuis `MYPULS_SESSION_COOKIE` (.env / secret
 * Cloudflare) — utile au tout premier run et pour ré-injecter un cookie après une coupure
 * > 7 j (REMEMBERME mort). Ensuite la table fait foi.
 */

async function readRow(db: Db): Promise<string | null> {
  const { data, error } = await db
    .from('ingest_session' as never)
    .select('cookie')
    .eq('id', SESSION_ID)
    .maybeSingle()
  if (error) throw new Error(`ingest_session lecture : ${error.message}`)
  return (data as { cookie?: string } | null)?.cookie ?? null
}

async function writeRow(db: Db, cookie: string): Promise<void> {
  const { error } = await db
    .from('ingest_session' as never)
    .upsert({ id: SESSION_ID, cookie, refreshed_at: new Date().toISOString() } as never, { onConflict: 'id' })
  if (error) throw new Error(`ingest_session écriture : ${error.message}`)
}

/** Cookie courant : table prioritaire, sinon amorçage depuis l'env. Null si aucun des deux. */
async function currentCookie(db: Db): Promise<string | null> {
  return (await readRow(db)) ?? process.env.MYPULS_SESSION_COOKIE?.trim() ?? null
}

/**
 * Lit le cookie stocké SANS ré-auth. Pour les mini-invocations du fan-out spenders, qui
 * réutilisent le cookie déjà rafraîchi en tête de run par l'orchestrateur.
 */
export async function loadCookie(db: Db): Promise<string> {
  const cookie = await currentCookie(db)
  if (!cookie) throw new Error('Aucune session MyPuls (table ingest_session vide et MYPULS_SESSION_COOKIE absent).')
  return cookie
}

/**
 * Ré-authentifie via le REMEMBERME courant, persiste le cookie frais, le renvoie. À appeler
 * UNE FOIS par run (pipeline principal ET orchestrateur spenders). Repousse l'expiration de
 * 7 j → tant qu'un run a lieu dans la fenêtre, la session est perpétuelle.
 */
export async function refreshCookie(db: Db): Promise<string> {
  const cookie = await currentCookie(db)
  if (!cookie) throw new Error('Aucune session MyPuls à rafraîchir (semer MYPULS_SESSION_COOKIE au moins une fois).')
  const remember = readCookie(cookie, 'REMEMBERME')
  if (!remember) {
    // Cookie sans remember-me (ex. amorçage partiel) : on ne peut pas glisser. On le teste et
    // on le garde tel quel s'il est encore valide — sinon échec explicite.
    if (await verifySession(cookie)) return cookie
    throw new Error('Session MyPuls sans REMEMBERME et PHPSESSID expiré — refournir un cookie « se souvenir de moi ».')
  }
  const fresh = await rememberMeLogin(remember)
  await writeRow(db, fresh.cookie)
  return fresh.cookie
}
