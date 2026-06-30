import { runPipeline } from './pipeline'

runPipeline()
  .then(() => {
    console.log('[ingestion] OK')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[ingestion] ÉCHEC', err)
    // TODO: notify (Telegram/email) avant de sortir
    process.exit(1)
  })
