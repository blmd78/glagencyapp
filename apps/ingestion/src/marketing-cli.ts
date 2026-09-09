import { loadEnv } from './env'
import { runMarketing } from './marketing'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (le client Supabase lit process.env).
loadEnv()

/**
 * Rattrapage des liens de tracking sur une plage arbitraire — le run nocturne ne réécrit
 * qu'une fenêtre glissante de 8 jours (`marketing.ts:70`), insuffisante après une coupure.
 * Le payload MyPuls porte la série `daily` depuis l'origine : un seul run rattrape tout,
 * au même coût de requêtes qu'un run normal (16 modèles × 2).
 *
 *   pnpm --filter @glagency/ingestion marketing 2026-09-01
 *
 * En CLI et pas par `?job=marketing` sur le Worker : un rattrapage long fait autant d'upserts
 * que de jours, au-delà des 50 sous-requêtes d'une invocation sur le plan Free. En local,
 * aucune limite.
 *
 * Cibler l'UAT plutôt que la prod = surcharger les deux variables en préfixe de commande
 * (`loadEnv()` ne remplit que les clés ABSENTES, cf. env.ts:15) :
 *   SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT pnpm …
 */
const arg = process.argv[2]
if (!arg || !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  console.error('usage : pnpm --filter @glagency/ingestion marketing <YYYY-MM-DD>')
  process.exit(1)
}

const startedAt = new Date()
console.log(`[marketing] rattrapage depuis ${arg} → ${process.env.SUPABASE_URL ?? '(SUPABASE_URL absente)'}`)
runMarketing({ backfillFrom: arg })
  .then(async (summary) => {
    console.log(`[marketing] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, {
      summary: { job: 'marketing', ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[marketing] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
