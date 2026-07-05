import { loadEnv } from './env'
import { createAdminClient } from '@glagency/db'
import { generateWeeklyInsights } from './insights'

// CLI locale : génère les insights hebdo sans passer par le Worker.
// Usage : pnpm insights
loadEnv()
generateWeeklyInsights(createAdminClient())
  .then((r) => {
    console.log(`[insights] ${r.generated} carte(s) générée(s) — semaine du ${r.weekStart}`)
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[insights] ÉCHEC', err)
    process.exit(1)
  })
