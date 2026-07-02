import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/** Charge le `.env` racine dans process.env (clés absentes uniquement). Retourne la racine repo. */
export function loadEnv(): string {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  try {
    for (const ln of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
      const s = ln.trim()
      if (!s || s.startsWith('#') || !s.includes('=')) continue
      const i = s.indexOf('=')
      const k = s.slice(0, i).trim()
      const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    // .env optionnel (ex. secrets injectés par l'hébergeur / Cloudflare)
  }
  return root
}
