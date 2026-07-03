import { loadEnv } from './env'
import { runPipeline } from './pipeline'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (le client Supabase lit process.env).
loadEnv()

// Argument optionnel : un jour précis `YYYY-MM-DD` (sinon = aujourd'hui + rattrapage).
const arg = process.argv[2]
const explicitDay = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : undefined

const startedAt = new Date()
runPipeline(explicitDay)
  .then(async (summary) => {
    console.log(`[ingestion] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, { summary })
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[ingestion] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
