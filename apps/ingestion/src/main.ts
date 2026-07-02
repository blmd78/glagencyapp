import { loadEnv } from './env'
import { runPipeline } from './pipeline'

// Charge le .env racine avant tout (le client Supabase lit process.env).
loadEnv()

// Argument optionnel : un jour précis `YYYY-MM-DD` (sinon = aujourd'hui + rattrapage).
const arg = process.argv[2]
const explicitDay = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : undefined

runPipeline(explicitDay)
  .then(() => {
    console.log('[ingestion] OK')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[ingestion] ÉCHEC', err)
    // TODO: notify (Telegram/email) avant de sortir
    process.exit(1)
  })
