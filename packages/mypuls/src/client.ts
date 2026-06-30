export const BASE_URL = 'https://mypuls.app'
export const API_BASE = 'https://mypuls.app/api/v1'

export interface MyPulsClient {
  /** Cookie de session web (pour le scraping). */
  cookie: string
  /** Token API v1 (header X-API-TOKEN). */
  apiToken: string
}

/**
 * Login MyPuls : formulaire web (récup CSRF token + POST → cookie de session).
 * Identifiants via env (jamais en clair dans le code).
 *
 * TODO: porter la logique de l'ancien `fetch_mypuls.py` (sert de spec) :
 *   GET /login → extraire _csrf_token → POST /login → cookie de session.
 */
export async function login(): Promise<MyPulsClient> {
  const email = process.env.MYPULS_EMAIL
  const password = process.env.MYPULS_PASSWORD
  const apiToken = process.env.MYPULS_API_KEY
  if (!email || !password || !apiToken) {
    throw new Error('MYPULS_EMAIL / MYPULS_PASSWORD / MYPULS_API_KEY manquants (cf. .env.example)')
  }
  throw new Error('login() non implémenté — squelette (cf. fetch_mypuls.py comme spec)')
}
