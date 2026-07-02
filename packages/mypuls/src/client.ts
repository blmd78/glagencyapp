export const BASE_URL = 'https://mypuls.app'
export const API_BASE = 'https://mypuls.app/api/v1'
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) glagency-ingestion'

export interface MyPulsClient {
  /** Cookie de session web (pour le scraping du dashboard). */
  cookie: string
  /** Token API v1 (header X-API-TOKEN). */
  apiToken: string
}

function parseSetCookies(list: string[]): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const sc of list) {
    const m = /^([^=]+)=([^;]*)/.exec(sc)
    if (m?.[1]) jar[m[1].trim()] = m[2] ?? ''
  }
  return jar
}

export const cookieHeader = (jar: Record<string, string>) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

/**
 * Login MyPuls (formulaire Symfony) : GET /login → `_csrf_token` + cookie session,
 * POST /login (Content-Type urlencoded obligatoire, sinon le body n'est pas parsé) →
 * cookies authentifiés (PHPSESSID + REMEMBERME). Identifiants via env.
 */
export async function login(): Promise<MyPulsClient> {
  const email = process.env.MYPULS_EMAIL
  const password = process.env.MYPULS_PASSWORD
  const apiToken = process.env.MYPULS_API_KEY ?? ''
  if (!email || !password) {
    throw new Error('MYPULS_EMAIL / MYPULS_PASSWORD manquants (cf. .env.example)')
  }

  const r1 = await fetch(`${BASE_URL}/login`, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  const jar = parseSetCookies(r1.headers.getSetCookie())
  const html = await r1.text()
  const csrf = /name="_csrf_token"[^>]*value="([^"]+)"/.exec(html)?.[1]
  if (!csrf) throw new Error('login: _csrf_token introuvable')

  const body = new URLSearchParams({
    _csrf_token: csrf,
    email,
    password,
    _remember_me: 'on',
  }).toString()
  const r2 = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar),
      Referer: `${BASE_URL}/login`,
      Origin: BASE_URL,
      'User-Agent': UA,
    },
    body,
  })
  Object.assign(jar, parseSetCookies(r2.headers.getSetCookie()))
  const location = r2.headers.get('location') ?? ''
  // Succès attendu = redirection (302) hors /login. Un 200 (re-render) = échec.
  if (!location || location.includes('/login')) {
    throw new Error(`login refusé (status ${r2.status}) — vérifier MYPULS_EMAIL/MYPULS_PASSWORD`)
  }
  return { cookie: cookieHeader(jar), apiToken }
}
