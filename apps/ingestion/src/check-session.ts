import { loadEnv } from './env'
import { verifySession } from '@glagency/mypuls'

/**
 * Vérifie que la session MyPuls injectée (MYPULS_SESSION_COOKIE) est encore valide, SANS
 * rien écrire. À lancer avant de poser le secret sur le Worker et quand un run part en
 * « session expirée ». Depuis le CAPTCHA Turnstile (~2026-08-12), le cookie est la seule
 * voie d'auth — cf. packages/mypuls/src/client.ts:login().
 *
 * Usage : pnpm --filter @glagency/ingestion check-session
 */
async function main() {
  loadEnv()
  const cookie = process.env.MYPULS_SESSION_COOKIE?.trim()
  if (!cookie) {
    console.error('❌ MYPULS_SESSION_COOKIE absent du .env — coller le cookie d’une session ouverte à la main.')
    process.exit(1)
  }
  const names = cookie.split(';').map((c) => c.split('=')[0]?.trim()).filter(Boolean)
  console.log('cookies fournis :', names.join(', ') || '(aucun)')
  if (!names.includes('PHPSESSID')) {
    console.warn('⚠️  PHPSESSID absent — la session risque de ne pas être reconnue.')
  }
  const ok = await verifySession(cookie)
  console.log(ok ? '✅ Session VALIDE (dashboard accessible).' : '❌ Session INVALIDE / expirée (retombe sur /login).')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('crash:', e)
  process.exit(1)
})
