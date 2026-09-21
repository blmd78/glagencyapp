import * as Sentry from '@sentry/node'
import { createAdminClient } from '@glagency/db'
import { addDays, todayParis } from '@glagency/core'
import { loadEnv } from './env'
import { loadActiveAccounts, ingestAccount } from './uncove-core'

// CLI du relevé Uncove (Subs + CA par compte). Briques réutilisables (worker compris) dans
// uncove-core.ts. Spec : docs/superpowers/specs/2026-09-21-uncove-analytics-design.md
//
// Usage : tsx src/uncove.ts [jours]   (fenêtre glissante, défaut 35 j, jusqu'à hier)

const DEFAULT_WINDOW_DAYS = 35

async function run(): Promise<void> {
  const db = createAdminClient()
  const accounts = await loadActiveAccounts(db)
  if (accounts.length === 0) {
    console.log('[uncove] aucun compte actif à scraper.')
    return
  }

  const windowDays = Number(process.argv[2]) || DEFAULT_WINDOW_DAYS
  const yesterday = addDays(todayParis(), -1)
  // Bornes ISO UTC. Approximation tz assumée : la réponse est clée par jour Europe/Paris et on
  // upsert par jour rendu → un léger débord de fenêtre est sans effet (on couvre large).
  const startIso = `${addDays(yesterday, -(windowDays - 1))}T00:00:00.000Z`
  const endIso = `${yesterday}T23:59:59.999Z`
  console.log(`[uncove] ${accounts.length} compte(s), fenêtre ${startIso.slice(0, 10)} → ${endIso.slice(0, 10)}`)

  let reconnect = 0
  for (const acc of accounts) {
    const r = await ingestAccount(db, acc, startIso, endIso)
    if (r.reconnect) reconnect++
    else console.log(`[uncove] « ${r.label} » : ${r.days} jour(s) écrit(s)`)
  }
  if (reconnect) console.log(`[uncove] ${reconnect} compte(s) à reconnecter (jeton rejeté).`)
  console.log('[uncove] terminé')
}

async function main(): Promise<void> {
  loadEnv()
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return run()
  Sentry.init({ dsn, tracesSampleRate: 0 })
  try {
    await run()
  } catch (err) {
    Sentry.captureException(err)
    throw err
  } finally {
    await Sentry.flush(3000)
  }
}

const isCli = process.argv[1]?.endsWith('uncove.ts')
if (isCli) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
