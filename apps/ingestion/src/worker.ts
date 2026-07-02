import { runPipeline } from './pipeline'

/**
 * Entrypoint Cloudflare Worker.
 *
 * Le Cron Trigger (`wrangler.toml [triggers]`) appelle `scheduled()` chaque soir →
 * `runPipeline()` (exactement les mêmes flux qu'en local : dashboard + /team/money +
 * money-team). Aucun accès disque ici (contrairement au CLI `main.ts`).
 *
 * Secrets : injectés en bindings via `wrangler secret put` (jamais dans le repo). Le code
 * métier lit `process.env` (createAdminClient, login) → on recopie les bindings dans
 * `process.env` au démarrage du handler. `fetch()` permet un déclenchement manuel APRÈS
 * déploiement, protégé par le secret TRIGGER_TOKEN (`Authorization: Bearer <token>`) —
 * l'URL workers.dev est publique, sans garde un simple crawler lancerait une ingestion en
 * pleine journée (données partielles). Sans TRIGGER_TOKEN posé → toujours 403.
 * En local, `wrangler dev --test-scheduled` passe par /__scheduled (pas par fetch).
 */
type Bindings = Record<string, string | undefined>
type Ctx = { waitUntil(promise: Promise<unknown>): void }

function bindEnv(env: Bindings): void {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && process.env[k] === undefined) process.env[k] = v
  }
}

export default {
  async scheduled(_controller: unknown, env: Bindings, ctx: Ctx): Promise<void> {
    bindEnv(env)
    ctx.waitUntil(
      runPipeline().then(
        () => console.log('[ingestion] OK'),
        (err: unknown) => console.error('[ingestion] ÉCHEC', err),
      ),
    )
  },

  async fetch(req: Request, env: Bindings, ctx: Ctx): Promise<Response> {
    const token = env.TRIGGER_TOKEN
    const auth = req.headers.get('authorization')
    if (!token || auth !== `Bearer ${token}`) {
      return new Response('forbidden\n', { status: 403 })
    }
    bindEnv(env)
    ctx.waitUntil(
      runPipeline().then(
        () => console.log('[ingestion] OK (trigger manuel)'),
        (err: unknown) => console.error('[ingestion] ÉCHEC (trigger manuel)', err),
      ),
    )
    return new Response('pipeline déclenché\n')
  },
}
