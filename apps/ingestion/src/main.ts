import { loadEnv } from './env'
import { runPipeline } from './pipeline'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (le client Supabase lit process.env).
loadEnv()

// Argument optionnel : un jour précis `YYYY-MM-DD` (sinon = aujourd'hui + rattrapage).
const arg = process.argv[2]
const explicitDay = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : undefined

/** Prévient le dashboard qu'un run vient d'écrire des faits → expire les caches taggés. */
async function pingRevalidate(): Promise<void> {
  const url = process.env.REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!url || !secret) return // env absente (dev) : no-op silencieux
  try {
    const res = await fetch(url, {
      method: 'POST',
      // Timeout : un réseau qui black-hole ne doit pas suspendre le cron indéfiniment.
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: ['facts-daily'] }),
    })
    if (!res.ok) console.warn(`[ingestion] revalidate KO (${res.status})`)
  } catch (e) {
    console.warn('[ingestion] revalidate injoignable', e)
  }
}

const startedAt = new Date()
runPipeline(explicitDay)
  .then(async (summary) => {
    console.log(`[ingestion] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, { summary })
    await pingRevalidate()
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[ingestion] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
