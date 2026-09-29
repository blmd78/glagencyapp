import { loadEnv } from './env'
import { runMarketingX } from './marketing-x'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (client Supabase et X_BEARER_TOKEN lisent process.env).
loadEnv()

/**
 * Relevé X à la main — mêmes briques que le fan-out nocturne (`?job=x`).
 *
 *   pnpm --filter @glagency/ingestion x
 *
 * ⚠️ Chaque run COÛTE : 0,010 $ par compte rendu par X (le même compte relu le même jour UTC
 * n'est pas refacturé).
 *
 * Cibler l'UAT : surcharger les deux variables en préfixe (cf. marketing-cli.ts) :
 *   SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT pnpm …
 */
const startedAt = new Date()
console.log(`[marketing-x] relevé → ${process.env.SUPABASE_URL ?? '(SUPABASE_URL absente)'}`)
runMarketingX()
  .then(async (summary) => {
    console.log(`[marketing-x] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, {
      summary: { job: 'marketing-x', ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[marketing-x] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
