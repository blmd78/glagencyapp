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
 * `process.env` au démarrage du handler. `fetch()` permet un déclenchement manuel pour
 * tester après déploiement (`wrangler dev --test-scheduled` ou un GET sur l'URL du Worker).
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

  async fetch(_req: unknown, env: Bindings, ctx: Ctx): Promise<Response> {
    bindEnv(env)
    ctx.waitUntil(runPipeline())
    return new Response('pipeline déclenché\n')
  },
}
