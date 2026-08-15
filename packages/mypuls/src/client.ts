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
 * Ouvre une session MyPuls.
 *
 * Depuis ~2026-08-12, MyPuls protège `/login` par un CAPTCHA Cloudflare Turnstile : le
 * login automatisé par mot de passe est refusé (POST → 302 `/login`, aucun cookie posé).
 * Voie prévue désormais : un cookie de session obtenu par un login HUMAIN (qui résout le
 * Turnstile), injecté via le secret `MYPULS_SESSION_COOKIE` (« PHPSESSID=…; REMEMBERME=… »).
 * Présent → on l'utilise tel quel, aucun POST. À renouveler quand la session expire
 * (REMEMBERME ≈ 30 jours) ; `verifySession()` teste sa validité.
 *
 * Fallback (conservé) : formulaire Symfony GET /login → `_csrf_token` + cookie session,
 * POST /login (Content-Type urlencoded obligatoire) → PHPSESSID + REMEMBERME. Ne marche
 * que sur un environnement sans Turnstile — sinon il lève l'erreur « login refusé ».
 */
export async function login(): Promise<MyPulsClient> {
  const apiToken = process.env.MYPULS_API_KEY ?? ''

  // Cookie de session injecté (login humain) : chemin nominal tant que le CAPTCHA est là.
  const injected = process.env.MYPULS_SESSION_COOKIE?.trim()
  if (injected) return { cookie: injected, apiToken }

  const email = process.env.MYPULS_EMAIL
  const password = process.env.MYPULS_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Session MyPuls indisponible : poser MYPULS_SESSION_COOKIE (login CAPTCHA) ou, à défaut, MYPULS_EMAIL/MYPULS_PASSWORD (cf. .env.example).',
    )
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
  // Succès attendu = redirection (302) hors /login. Un 200 (re-render) OU un 302 vers
  // /login = échec — depuis le CAPTCHA Turnstile, c'est le cas systématique (cf. login()).
  if (!location || location.includes('/login')) {
    throw new Error(
      `login refusé (status ${r2.status}) — MyPuls exige un CAPTCHA au login : fournir un cookie de session via MYPULS_SESSION_COOKIE (cf. apps/ingestion/README-cron.md).`,
    )
  }
  return { cookie: cookieHeader(jar), apiToken }
}

/**
 * Teste une session sans rien écrire : GET /dashboard suivi. 200 (pas de retombée /login)
 * = cookie valide ; sinon session morte. Sert à valider `MYPULS_SESSION_COOKIE` avant de le
 * poser en secret / avant un run. N'est PAS appelée par login() (coûterait +1 sous-requête
 * par mini-invocation du fan-out, hors budget Worker Free).
 */
export async function verifySession(cookie: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/dashboard`, {
    redirect: 'manual',
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' },
  })
  const loc = res.headers.get('location') ?? ''
  return res.status === 200 && !loc.includes('/login')
}
