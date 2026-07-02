import { runPipeline } from './pipeline'
import { parseMoneyTeamHR, fetchMoneyTeamDayHR } from './money-team-hr'

/**
 * Entrypoint Cloudflare Worker.
 *
 * Le Cron Trigger (`wrangler.toml [triggers]`) appelle `scheduled()` chaque soir →
 * `runPipeline()` (mêmes flux qu'en local : dashboard + /team/money + money-team). Le parsing
 * money-team utilise `fetchMoneyTeamDayHR` (HTMLRewriter natif) au lieu de cheerio pour tenir
 * sous la limite 10 ms CPU du plan Free. Aucun accès disque ici (contrairement au CLI `main.ts`).
 *
 * Secrets : injectés en bindings via `wrangler secret put` (jamais dans le repo). Le code
 * métier lit `process.env` (createAdminClient, login) → on recopie les bindings dans
 * `process.env` au démarrage du handler. `fetch()` sert au déclenchement manuel APRÈS
 * déploiement, protégé par le secret TRIGGER_TOKEN (`Authorization: Bearer <token>`) —
 * l'URL workers.dev est publique, sans garde un crawler lancerait une ingestion en pleine
 * journée (données partielles). Sans TRIGGER_TOKEN posé → toujours 403.
 * En local, `wrangler dev --test-scheduled` passe par /__scheduled (pas par fetch).
 *
 * Route de vérif `POST /__parse-moneyteam` (dev only) : parse le HTML du body avec
 * HTMLRewriter et renvoie le JSON → permet de comparer au parser cheerio sans déployer.
 * Désactivée en prod (refusée si TRIGGER_TOKEN est posé, i.e. secret présent).
 */
type Bindings = Record<string, string | undefined>
type Ctx = { waitUntil(promise: Promise<unknown>): void }

const DEPS = { fetchMoneyTeam: fetchMoneyTeamDayHR }

function bindEnv(env: Bindings): void {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && process.env[k] === undefined) process.env[k] = v
  }
}

export default {
  async scheduled(_controller: unknown, env: Bindings, ctx: Ctx): Promise<void> {
    bindEnv(env)
    ctx.waitUntil(
      runPipeline(undefined, DEPS).then(
        () => console.log('[ingestion] OK'),
        (err: unknown) => console.error('[ingestion] ÉCHEC', err),
      ),
    )
  },

  async fetch(req: Request, env: Bindings, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url)

    // Vérif locale du parser HTMLRewriter (uniquement quand aucun secret n'est posé = dev).
    if (req.method === 'POST' && url.pathname === '/__parse-moneyteam' && !env.TRIGGER_TOKEN) {
      const t0 = Date.now()
      const parsed = await parseMoneyTeamHR(new Response(req.body, { headers: { 'content-type': 'text/html' } }))
      return Response.json({
        ms: Date.now() - t0,
        chatters: parsed.chatters.length,
        transactions: parsed.transactions.length,
        sampleChatter: parsed.chatters[0],
        sampleTx: parsed.transactions[0],
        parsed,
      })
    }

    const token = env.TRIGGER_TOKEN
    const auth = req.headers.get('authorization')
    if (!token || auth !== `Bearer ${token}`) {
      return new Response('forbidden\n', { status: 403 })
    }
    bindEnv(env)
    // `?day=YYYY-MM-DD` : rejoue un jour précis (idempotent) — pour tester/backfill sans
    // déclencher le rattrapage jusqu'à aujourd'hui (qui écrirait un jour partiel).
    const dayParam = url.searchParams.get('day')
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined
    ctx.waitUntil(
      runPipeline(day, DEPS).then(
        () => console.log(`[ingestion] OK (trigger manuel${day ? ` ${day}` : ''})`),
        (err: unknown) => console.error('[ingestion] ÉCHEC (trigger manuel)', err),
      ),
    )
    return new Response(`pipeline déclenché${day ? ` (${day})` : ''}\n`)
  },
}
