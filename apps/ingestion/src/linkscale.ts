import { addDays, todayParis } from '@glagency/core'
import { loadEnv } from './env'
import { runMarketingLinkscale } from './marketing-linkscale'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (client Supabase et LINKSCALE_API_KEY lisent process.env).
loadEnv()

/**
 * Relevé LinkScale à la main — mêmes briques que le fan-out nocturne (`?job=linkscale`).
 *
 *   pnpm --filter @glagency/ingestion linkscale                          # J-2 et J-1
 *   pnpm --filter @glagency/ingestion linkscale 2026-05-01 2026-09-29    # remplissage
 *
 * Une longue plage passe par ici et pas par le Worker : un appel LinkScale par jour, au-delà des
 * 50 sous-requêtes d'une invocation Free. Cibler l'UAT = surcharger en préfixe (cf. marketing-cli.ts) :
 *   SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT pnpm …
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/
const [from, to] = process.argv.slice(2)
let days: string[] | undefined
if (from || to) {
  if (!from || !to || !DAY.test(from) || !DAY.test(to) || from > to) {
    console.error('usage : pnpm --filter @glagency/ingestion linkscale [<AAAA-MM-JJ> <AAAA-MM-JJ>]')
    process.exit(1)
  }
  const lastDone = addDays(todayParis(), -1)
  if (to > lastDone) {
    console.error(`${to} n'est pas terminé à Paris : dernier jour possible = ${lastDone}`)
    process.exit(1)
  }
  days = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
}

const startedAt = new Date()
console.log(
  `[marketing-linkscale] relevé${days ? ` ${from} → ${to} (${days.length} j)` : ''} → ${process.env.SUPABASE_URL ?? '(SUPABASE_URL absente)'}`,
)
runMarketingLinkscale({ days })
  .then(async (summary) => {
    console.log(`[marketing-linkscale] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, {
      summary: { job: 'marketing-linkscale', ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[marketing-linkscale] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
