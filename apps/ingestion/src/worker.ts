import * as Sentry from '@sentry/cloudflare'
import type { IngestRunSummary } from '@glagency/core'
import { runPipeline } from './pipeline'
import { parseMoneyTeamHR, fetchMoneyTeamDayHR } from './money-team-hr'
import { recordRun, type IngestTrigger } from './record-run'
import { generateWeeklyInsights } from './insights'
import { createAdminClient } from '@glagency/db'

/**
 * Entrypoint Cloudflare Worker.
 *
 * Le Cron Trigger (`wrangler.toml [triggers]`) appelle `scheduled()` chaque soir →
 * `runPipeline()` (mêmes flux qu'en local : dashboard + /team/money + money-team). Le parsing
 * money-team utilise `fetchMoneyTeamDayHR` (HTMLRewriter natif) au lieu de cheerio pour tenir
 * sous la limite 10 ms CPU du plan Free. Aucun accès disque ici (contrairement au CLI `main.ts`).
 *
 * Watcher : chaque run insère une ligne `ingest_runs` (historique durable) ; un run
 * `degraded` (login KO, jour en échec, 0 ligne) part en warning Sentry ; un crash est
 * capturé par `withSentry` ; le cron monitor Sentry détecte en plus un cron qui NE
 * TOURNE PAS (missed check-in) — chose qu'aucune alerte interne ne peut voir.
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

// maxCatchup 3 : plan Free = 50 sous-requêtes/invocation, un run coûte ~13 appels fixes
// + ~8/jour → 3 jours ≈ 37, marge pour la pagination et Sentry. Auto-cicatrisant : un
// retard > 3 jours se résorbe nuit après nuit (le CLI local, sans limite, backfille plus).
const DEPS = { fetchMoneyTeam: fetchMoneyTeamDayHR, maxCatchup: 3 }

// Cron monitor Sentry : même crontab que wrangler.toml (les deux doivent rester alignés).
// Détecte un cron manqué (missed check-in) — invisible pour toute alerte interne.
const MONITOR_SLUG = 'ingestion-mypuls-nightly'
const MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '5 23 * * *' },
  timezone: 'Etc/UTC',
  checkinMargin: 30,
  maxRuntime: 30,
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const

function bindEnv(env: Bindings): void {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && process.env[k] === undefined) process.env[k] = v
  }
}

/** Run + résumé loggé + warning Sentry si dégradé + ligne ingest_runs. Re-throw les crashs. */
async function runAndRecord(triggeredBy: IngestTrigger, day?: string): Promise<IngestRunSummary> {
  const startedAt = new Date()
  try {
    const summary = await runPipeline(day, DEPS)
    console.log(`[ingestion] ${summary.status.toUpperCase()} (${triggeredBy})`, JSON.stringify(summary))
    if (summary.status === 'degraded') {
      Sentry.captureMessage(
        `[ingestion] run dégradé : ${summary.warnings.join(' | ') || 'cf. ingest_runs'}`,
        'warning',
      )
    }
    await recordRun(triggeredBy, startedAt, { summary })
    // Insights hebdo « quotas » : régénérés après chaque run (la ligne « semaine en
    // cours » se rafraîchit ; clés stables → les statuts UI survivent). Un échec ici
    // ne casse PAS le run d'ingestion.
    try {
      const ins = await generateWeeklyInsights(createAdminClient())
      console.log(`[insights] ${ins.generated} carte(s) — semaine du ${ins.weekStart}`)
    } catch (e) {
      console.warn('[insights] génération échouée (run OK par ailleurs) :', (e as Error).message)
    }
    return summary
  } catch (err) {
    console.error(`[ingestion] ÉCHEC (${triggeredBy})`, err)
    await recordRun(triggeredBy, startedAt, { error: err })
    throw err
  }
}

const handler = {
  async scheduled(controller: { noRetry(): void }, env: Bindings, _ctx: Ctx): Promise<void> {
    bindEnv(env)
    // Awaité (pas de waitUntil) : un crash marque l'invocation cron en échec côté
    // Cloudflare, est capturé par withSentry, et passe le check-in du monitor en error.
    try {
      await Sentry.withMonitor(MONITOR_SLUG, () => runAndRecord('cron'), MONITOR_CONFIG)
    } catch (err) {
      // Structure MyPuls inattendue = échec non transitoire : relancer le même scrape
      // dans la foulée ne peut pas réussir — on épargne le retry Cloudflare.
      if (/parse|html|selector|introuvable|invalide/i.test((err as Error)?.message ?? '')) {
        controller.noRetry()
      }
      throw err
    }
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
    // AWAITÉ (pas de waitUntil) : Cloudflare annule les promesses waitUntil 30 s après
    // la réponse — un run tué en plein vol n'écrirait ni ingest_runs ni event Sentry.
    // Une requête HTTP maintenue ouverte n'a pas cette limite ; le curl voit le résultat.
    try {
      const summary = await runAndRecord('http', day)
      return Response.json({ status: summary.status, days: summary.days.length, warnings: summary.warnings })
    } catch (err) {
      Sentry.captureException(err)
      return new Response(`échec pipeline : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
    }
  },
}

// SENTRY_DSN absent (dev local, secret pas posé) → SDK inactif, le worker fonctionne à
// l'identique. `withSentry` capture les exceptions de scheduled()/fetch() et flush via
// waitUntil — aucun flush manuel à écrire.
export default Sentry.withSentry(
  (env: Bindings) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  handler,
)
