import { loadEnv } from './env'
import { login, switchCreator } from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'
import { creatorMap, ingestScriptsSnapshot } from './spenders-core'

/**
 * Backfill ciblé de `creator_script_daily` (snapshot scripts par jour) — le run spenders
 * quotidien ne couvre que « hier », ce CLI rejoue des jours précis (ex. après un trou de
 * session). Pour chaque jour × modèle : switch-creator (les scripts sont servis « pour le
 * modèle courant ») puis ingestScriptsSnapshot(day). Les colonnes du jour (sales_day,
 * revenue_day) sont exactes ; les *_cum reflètent le cumul À L'INSTANT DU RUN (comme le cron).
 *
 * Usage : pnpm --filter @glagency/ingestion backfill-scripts 2026-08-12 2026-08-13 2026-08-14
 */
async function main() {
  loadEnv()
  const days = process.argv.slice(2).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (!days.length) {
    console.error('usage: backfill-scripts <YYYY-MM-DD> [YYYY-MM-DD ...]')
    process.exit(1)
  }
  const db = createAdminClient()
  const byMypulsId = await creatorMap(db)
  const { cookie } = await login()

  for (const day of days) {
    let ok = 0
    let rows = 0
    for (const [mypulsId, creatorId] of byMypulsId) {
      try {
        await switchCreator(mypulsId, cookie)
        const n = await ingestScriptsSnapshot(db, cookie, creatorId, day)
        rows += n
        ok++
      } catch (e) {
        console.warn(`[scripts] ${day} modèle ${mypulsId}: ÉCHEC — ${(e as Error).message}`)
      }
    }
    console.log(`[scripts] ${day}: ${ok}/${byMypulsId.size} modèles OK, ${rows} lignes`)
  }
  console.log('[scripts] backfill terminé')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
