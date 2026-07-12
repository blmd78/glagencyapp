import * as Sentry from '@sentry/node'
import { login } from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'
import { loadEnv } from './env'
import { creatorMap, ingestAllConversations, ingestFanTransactions } from './spenders-core'

// CLI Node du scrape spenders (backfill + run manuel). Les briques réutilisables (worker
// compris) vivent dans spenders-core.ts ; ici on garde le login, la boucle jours et Sentry.

const iso = (d: Date) => d.toISOString().slice(0, 10)
function* eachDay(from: string, to: string) {
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (d <= end) {
    yield iso(d)
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

/** Cœur du run (hors Sentry) — extrait pour être wrappé par le cron monitor. */
async function run() {
  const db = createAdminClient()
  const byMypulsId = await creatorMap(db)

  const yesterday = iso(new Date(Date.now() - 24 * 3600 * 1000))
  const from = process.argv[2] ?? yesterday
  const to = process.argv[3] ?? process.argv[2] ?? yesterday

  for (const day of eachDay(from, to)) {
    const r = await ingestFanTransactions(db, byMypulsId, day)
    console.log(`[spenders] transactions ${r.day}: ${r.upserted}/${r.fetched}`)
  }
  const { cookie } = await login()
  await ingestAllConversations(db, cookie, byMypulsId)
  console.log('[spenders] terminé')
}

/**
 * CLI : `tsx src/spenders.ts [from] [to]` — sans argument : hier seul + conversations.
 * Monitoring aligné sur le worker : SENTRY_DSN absent (dev local) → SDK inactif, run
 * identique. Sinon : cron monitor (détecte un run manqué) + capture d'exception.
 */
async function main() {
  loadEnv()
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return run()

  Sentry.init({ dsn, tracesSampleRate: 0 })
  // PAS de cron check-in ici : le monitor ingestion-spenders-nightly appartient au worker
  // (cron minuit UTC). Un run CLI ad hoc qui check-in sur le même slug réécrit la config du
  // monitor et, s'il est interrompu (Ctrl-C), déclenche un faux « timeout » (incident 10/07).
  try {
    await run()
  } catch (err) {
    Sentry.captureException(err)
    throw err
  } finally {
    await Sentry.flush(3000)
  }
}

const isCli = process.argv[1]?.endsWith('spenders.ts')
if (isCli) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
