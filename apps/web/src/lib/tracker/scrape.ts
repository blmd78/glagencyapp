import 'server-only'

/**
 * Connexion au tracker Good Luck Agency et lecture throttlée de ses pages.
 *
 * On se connecte en HTTP comme un humain — POST des identifiants sur `/login`, on garde le cookie
 * de session, on lit les pages avec. Aucune écriture chez eux : reprise en LECTURE SEULE.
 *
 * `server-only` : le mot de passe du tracker saisi par l'encadrant ne doit JAMAIS toucher le
 * navigateur au-delà du formulaire — cette fonction ne tourne qu'en Server Action.
 *
 * THROTTLE obligatoire : un scan brutal (200+ requêtes d'affilée) fait décrocher leur petit VPS —
 * constaté en reconnaissance. On espace, quitte à être lent.
 */

const TRACKER_BASE = 'https://chatterstracker.duckdns.org'
const THROTTLE_MS = 400

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class TrackerAuthError extends Error {}

/** Ouvre une session : rend le cookie à rejouer sur les pages suivantes, ou lève si le login échoue. */
export async function trackerLogin(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password })
  const res = await fetch(`${TRACKER_BASE}/login`, { method: 'POST', body, redirect: 'manual' })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  // Succès = 302 (redirection post-login) + cookie. Un 200 rend la page de login = identifiants
  // refusés. `loginAllowed` du tracker peut aussi rendre 401 en cas de trop d'essais.
  if (!cookie || res.status === 200 || res.status === 401) {
    throw new TrackerAuthError('Identifiant ou mot de passe du tracker incorrect.')
  }
  if (res.status !== 302) throw new Error(`Connexion au tracker impossible (HTTP ${res.status}).`)
  return cookie
}

/** GET throttlé d'une page, avec le cookie de session. */
export async function trackerGet(cookie: string, path: string): Promise<string> {
  await sleep(THROTTLE_MS)
  const res = await fetch(`${TRACKER_BASE}${path}`, { headers: { cookie } })
  if (!res.ok) throw new Error(`Lecture du tracker échouée (${path} → HTTP ${res.status}).`)
  return res.text()
}
