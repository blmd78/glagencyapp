import * as Sentry from '@sentry/cloudflare'
import { login } from '@glagency/mypuls'
import type { IngestRunSummary } from '@glagency/core'
import { runPipeline } from './pipeline'
import { parseMoneyTeamHR, fetchMoneyTeamDayHR } from './money-team-hr'
import { recordRun, type IngestTrigger } from './record-run'
import { runMarketing } from './marketing'
import { runMarketingSocial } from './marketing-social'
import { runMarketingTelegram } from './marketing-telegram'
import { generateWeeklyInsights } from './insights'
import {
  chatterResolver,
  creatorMap,
  ingestFanTransactions,
  ingestOneModel,
} from './spenders-core'
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
type Bindings = Record<string, string | undefined> & {
  /** Service Binding du worker vers lui-même (fan-out spenders) — cf. wrangler.toml [[services]]. */
  SELF?: { fetch(url: string, init?: { headers?: Record<string, string> }): Promise<Response> }
}
type Ctx = { waitUntil(promise: Promise<unknown>): void }

// maxCatchup 3 : plan Free = 50 sous-requêtes/invocation, un run coûte ~13 appels fixes
// + ~8/jour → 3 jours ≈ 37, marge pour la pagination et Sentry. Auto-cicatrisant : un
// retard > 3 jours se résorbe nuit après nuit (le CLI local, sans limite, backfille plus).
const DEPS = { fetchMoneyTeam: fetchMoneyTeamDayHR, maxCatchup: 3 }

// Cron monitor Sentry : même crontab que wrangler.toml (les deux doivent rester alignés).
// Détecte un cron manqué (missed check-in) — invisible pour toute alerte interne.
const MONITOR_SLUG = 'ingestion-mypuls-nightly'
const MONITOR_MKT_SLUG = 'ingestion-marketing-nightly'
const MONITOR_SOCIAL_SLUG = 'ingestion-marketing-social-nightly'
const MONITOR_TG_SLUG = 'ingestion-marketing-telegram-nightly'
const MONITOR_SPENDERS_SLUG = 'ingestion-spenders-nightly'
const SPENDERS_CRON = '0 0 * * *'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Orchestrateur du scrape spenders (fan-out). Le plan Free plafonne à 10 ms CPU + 50
 * sous-req PAR INVOCATION : impossible de traiter les 16 modèles (16k conversations) en une
 * fois. Solution : cette invocation fait le léger (transactions de la veille via l'API
 * token) puis lance UNE mini-requête par modèle vers `?job=spenders&model=…` — chaque
 * mini-requête est une invocation séparée, avec son propre budget, qui scrape 1 modèle.
 * Pas de cookie partagé : chaque mini-invocation re-login (switch-creator est lié à la
 * session — un cookie partagé en parallèle ferait lire le mauvais modèle).
 */
async function runSpendersOrchestrator(env: Bindings) {
  const startedAt = new Date()
  const db = createAdminClient()
  const byMypulsId = await creatorMap(db)
  const yesterday = iso(new Date(Date.now() - 24 * 3600 * 1000))
  const warnings: string[] = []

  try {
    const tx = await ingestFanTransactions(db, byMypulsId, yesterday)
    console.log(`[spenders] transactions ${tx.day}: ${tx.upserted}/${tx.fetched}`)
  } catch (err) {
    warnings.push(`transactions: ${(err as Error).message}`)
  }

  // Fan-out via le Service Binding SELF : un fetch() global vers sa propre URL workers.dev
  // est interdit par Cloudflare (erreur 1042) — le binding est le canal worker→worker prévu,
  // et chaque appel reste une invocation séparée avec son propre budget.
  const { SELF: self, WORKER_SELF_URL: selfUrl, TRIGGER_TOKEN: triggerToken } = env
  if (!self || !selfUrl || !triggerToken) {
    throw new Error('binding SELF / WORKER_SELF_URL / TRIGGER_TOKEN requis pour le fan-out spenders')
  }
  // EN SÉRIE, PAS EN RAFALE : chaque mini-invocation fait SON login MyPuls — 16 logins
  // simultanés déclenchent le rate-limit (429 « login refusé ») au-delà de ~10 (run du
  // 2026-07-14 : 10/16). Lancement séquentiel espacé de 2 s, puis une SECONDE CHANCE
  // après 15 s de pause pour les refusés (le rate-limit se relâche). Wall time ~2-5 min :
  // sans enjeu pour une invocation cron ; le budget CPU/sous-requêtes ne change pas.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const scrape = async (mypulsId: string, creatorId: string) => {
    const r = await self.fetch(`${selfUrl}?job=spenders&model=${mypulsId}&creator=${creatorId}`, {
      headers: { Authorization: `Bearer ${triggerToken}` },
    })
    if (!r.ok) throw new Error(`modèle ${mypulsId}: HTTP ${r.status} ${await r.text()}`)
    return r.json()
  }
  let ok = 0
  const failed: Array<[string, string]> = []
  for (const [mypulsId, creatorId] of byMypulsId) {
    try {
      await scrape(mypulsId, creatorId)
      ok++
    } catch {
      failed.push([mypulsId, creatorId])
    }
    await sleep(2000)
  }
  if (failed.length) {
    console.log(`[spenders] ${failed.length} modèle(s) refusé(s) — seconde chance dans 15 s`)
    await sleep(15_000)
    for (const [mypulsId, creatorId] of failed) {
      try {
        await scrape(mypulsId, creatorId)
        ok++
      } catch (err) {
        warnings.push(String(err))
      }
      await sleep(3000)
    }
  }
  console.log(`[spenders] fan-out : ${ok}/${byMypulsId.size} modèles OK`)

  const status = warnings.length ? 'degraded' : 'ok'
  if (status === 'degraded') {
    Sentry.captureMessage(`[spenders] run dégradé : ${warnings.join(' | ')}`, 'warning')
  }
  await recordRun('cron', startedAt, {
    summary: { job: 'spenders', status, modelsOk: ok, total: byMypulsId.size, warnings } as unknown as Parameters<typeof recordRun>[2]['summary'],
  })
  // 0 modèle passé = échec franc, pas un run dégradé : re-throw pour que le check-in du
  // monitor Sentry passe en error (sinon le monitor reste vert alors que rien n'a tourné).
  if (byMypulsId.size > 0 && ok === 0) {
    throw new Error(`[spenders] fan-out : 0/${byMypulsId.size} modèles OK — ${warnings[0] ?? 'cf. ingest_runs'}`)
  }
  return { status, modelsOk: ok, total: byMypulsId.size, warnings }
}

/** Une mini-invocation : scrape UN modèle (login isolé → switch → chat/init → upsert). */
async function scrapeOneModel(mypulsId: string, creatorId: string): Promise<number> {
  const db = createAdminClient()
  const { cookie } = await login()
  const resolveChatter = await chatterResolver(db)
  return ingestOneModel(db, cookie, mypulsId, creatorId, resolveChatter)
}
const MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '5 23 * * *' },
  timezone: 'Etc/UTC',
  checkinMargin: 30,
  maxRuntime: 30,
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const

/** Run marketing (liens ou social) + log + trace ingest_runs + warning Sentry si dégradé. */
async function runJobAndLog<T extends { status: string; warnings: string[] }>(
  job: 'marketing' | 'marketing-social' | 'marketing-telegram',
  run: () => Promise<T>,
  triggeredBy: IngestTrigger,
): Promise<T> {
  const startedAt = new Date()
  try {
    const summary = await run()
    console.log(`[${job}] ${summary.status.toUpperCase()} (${triggeredBy})`, JSON.stringify(summary))
    if (summary.status === 'degraded') {
      Sentry.captureMessage(`[${job}] run dégradé : ${summary.warnings.join(' | ')}`, 'warning')
    }
    await recordRun(triggeredBy, startedAt, {
      summary: { job, ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    return summary
  } catch (err) {
    console.error(`[${job}] ÉCHEC (${triggeredBy})`, err)
    await recordRun(triggeredBy, startedAt, { error: err })
    throw err
  }
}

/** Run marketing + log + trace ingest_runs + warning Sentry si dégradé. Re-throw les crashs. */
async function runMarketingAndLog(triggeredBy: IngestTrigger): Promise<Awaited<ReturnType<typeof runMarketing>>> {
  const startedAt = new Date()
  try {
    const summary = await runMarketing()
    console.log(`[marketing] ${summary.status.toUpperCase()} (${triggeredBy})`, JSON.stringify(summary))
    if (summary.status === 'degraded') {
      Sentry.captureMessage(`[marketing] run dégradé : ${summary.warnings.join(' | ')}`, 'warning')
    }
    // Même historique durable que le run chatteurs — le champ summary porte job: 'marketing'.
    await recordRun(triggeredBy, startedAt, {
      summary: { job: 'marketing', ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    return summary
  } catch (err) {
    console.error(`[marketing] ÉCHEC (${triggeredBy})`, err)
    await recordRun(triggeredBy, startedAt, { error: err })
    throw err
  }
}

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
  async scheduled(controller: { noRetry(): void; cron?: string }, env: Bindings, _ctx: Ctx): Promise<void> {
    bindEnv(env)
    // 23h20 UTC = pipeline marketing (invocation dédiée, cf. wrangler.toml [triggers]).
    // Son propre moniteur Sentry : détecte aussi un cron qui NE TOURNE PAS.
    if (controller.cron === '20 23 * * *') {
      await Sentry.withMonitor(MONITOR_MKT_SLUG, () => runMarketingAndLog('cron'), {
        ...MONITOR_CONFIG,
        schedule: { type: 'crontab', value: '20 23 * * *' },
      })
      return
    }
    // 23h35 UTC = comptes Instagram via Apify (invocation dédiée : le poll de l'actor
    // consomme ~40 sous-requêtes à lui seul).
    if (controller.cron === '35 23 * * *') {
      await Sentry.withMonitor(
        MONITOR_SOCIAL_SLUG,
        () => runJobAndLog('marketing-social', runMarketingSocial, 'cron'),
        { ...MONITOR_CONFIG, schedule: { type: 'crontab', value: '35 23 * * *' }, maxRuntime: 60 },
      )
      return
    }
    // 23h50 UTC = canaux Telegram (pages publiques t.me/s — no-op tant qu'aucun canal
    // n'est déclaré dans mkt_social_accounts).
    if (controller.cron === '50 23 * * *') {
      await Sentry.withMonitor(
        MONITOR_TG_SLUG,
        () => runJobAndLog('marketing-telegram', runMarketingTelegram, 'cron'),
        { ...MONITOR_CONFIG, schedule: { type: 'crontab', value: '50 23 * * *' } },
      )
      return
    }
    // Minuit UTC = scrape spenders (transactions veille + fan-out 1 invocation/modèle).
    // Après les runs marketing pour ne pas cumuler la charge du compte.
    if (controller.cron === SPENDERS_CRON) {
      await Sentry.withMonitor(MONITOR_SPENDERS_SLUG, () => runSpendersOrchestrator(env), {
        ...MONITOR_CONFIG,
        schedule: { type: 'crontab', value: SPENDERS_CRON },
        maxRuntime: 120,
      })
      return
    }
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
    // `?job=telegram` : déclenche le scrape des canaux Telegram seul (idempotent).
    if (url.searchParams.get('job') === 'telegram') {
      try {
        const summary = await runJobAndLog('marketing-telegram', runMarketingTelegram, 'http')
        return Response.json(summary)
      } catch (err) {
        Sentry.captureException(err)
        return new Response(`échec telegram : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
      }
    }
    // `?job=social` : déclenche le scrape Instagram seul (idempotent).
    if (url.searchParams.get('job') === 'social') {
      try {
        const summary = await runJobAndLog('marketing-social', runMarketingSocial, 'http')
        return Response.json(summary)
      } catch (err) {
        Sentry.captureException(err)
        return new Response(`échec social : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
      }
    }
    // `?job=marketing` : déclenche le pipeline marketing seul (idempotent).
    if (url.searchParams.get('job') === 'marketing') {
      try {
        const summary = await runMarketingAndLog('http')
        return Response.json(summary)
      } catch (err) {
        Sentry.captureException(err)
        return new Response(`échec marketing : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
      }
    }
    // `?job=spenders&model=<mypulsId>&creator=<uuid>` : mini-invocation du fan-out —
    // scrape 1 modèle (appelée par l'orchestrateur cron, ou à la main pour tester).
    if (url.searchParams.get('job') === 'spenders') {
      const model = url.searchParams.get('model')
      const creator = url.searchParams.get('creator')
      if (!model || !creator) return new Response('model & creator requis\n', { status: 400 })
      try {
        const n = await scrapeOneModel(model, creator)
        return Response.json({ model, conversations: n })
      } catch (err) {
        Sentry.captureException(err)
        return new Response(`échec spenders modèle ${model} : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
      }
    }
    // `?job=spenders-orchestrate` : déclenche le fan-out complet à la main (test).
    if (url.searchParams.get('job') === 'spenders-orchestrate') {
      try {
        const summary = await runSpendersOrchestrator(env)
        return Response.json(summary)
      } catch (err) {
        Sentry.captureException(err)
        return new Response(`échec spenders : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
      }
    }
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
