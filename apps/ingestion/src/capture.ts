import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { login, BASE_URL, API_BASE } from '@glagency/mypuls'
import { loadEnv } from './env'

// Capture d'une page MyPuls authentifiée → fichier brut dans raw/pages/.
// Outil de dev : Benoit donne une URL dans le chat, on capture, on écrit le parser
// dans @glagency/mypuls à partir du fichier capturé (cf. CLAUDE.md racine).
// Usage : pnpm capture <url>   (URL absolue, ou chemin type /dashboard/stats)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) glagency-ingestion'
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../raw/pages')

/** `/creator/messaging-money-team?start=2026-07-01` → `creator-messaging-money-team_start-2026-07-01`. */
function slug(u: URL): string {
  const path = u.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
  const query = [...u.searchParams.entries()].map(([k, v]) => `${k}-${v}`).join('_')
  return [path || 'root', query].filter(Boolean).join('_').replace(/[^a-zA-Z0-9._-]+/g, '-')
}

async function capture(input: string): Promise<void> {
  loadEnv()
  const url = new URL(input.startsWith('http') ? input : `${BASE_URL}/${input.replace(/^\/+/, '')}`)
  if (url.origin !== BASE_URL) throw new Error(`URL hors MyPuls : ${url.origin} (attendu ${BASE_URL})`)

  const { cookie, apiToken } = await login()
  const isApi = url.href.startsWith(API_BASE)
  const res = await fetch(url, {
    headers: isApi
      ? { 'X-API-TOKEN': apiToken, Accept: 'application/json', 'User-Agent': UA }
      : { Cookie: cookie, Accept: 'text/html', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`GET ${url.pathname} ${res.status}`)
  if (res.url.includes('/login')) throw new Error('capture : session expirée (redirigé vers /login)')

  const body = await res.text()
  const ext = (res.headers.get('content-type') ?? '').includes('json') ? 'json' : 'html'
  mkdirSync(OUT_DIR, { recursive: true })
  const file = resolve(OUT_DIR, `${slug(url)}.${ext}`)
  writeFileSync(file, body)
  console.log(`[capture] ${url.href}`)
  console.log(`[capture] → ${file} (${Math.round(body.length / 1024)} ko)`)
}

const arg = process.argv[2]
if (!arg) {
  console.error('Usage : pnpm capture <url>   ex. pnpm capture /dashboard/stats')
  process.exit(1)
}
capture(arg).catch((err: unknown) => {
  console.error('[capture] ÉCHEC', err)
  process.exit(1)
})
