import { createAdminClient } from '@glagency/db'
import type { Json } from '@glagency/db'
import type { IngestRunSummary } from '@glagency/core'

export type IngestTrigger = 'cron' | 'http' | 'local'

/**
 * Insère la ligne `ingest_runs` d'un run — l'historique durable (les Workers Logs du
 * plan Free ne gardent que 3 jours). Ne throw JAMAIS : l'échec de l'enregistrement ne
 * doit ni casser le run ni masquer son erreur d'origine (il est juste loggé).
 */
export async function recordRun(
  triggeredBy: IngestTrigger,
  startedAt: Date,
  outcome: { summary?: IngestRunSummary; error?: unknown },
): Promise<void> {
  try {
    const db = createAdminClient()
    const err = outcome.error
    const { error } = await db.from('ingest_runs').insert({
      started_at: startedAt.toISOString(),
      status: outcome.summary?.status ?? 'failed',
      triggered_by: triggeredBy,
      summary: (outcome.summary ?? {}) as unknown as Json,
      error: err == null ? null : err instanceof Error ? err.message : String(err),
    })
    if (error) throw error
  } catch (e) {
    console.error('[ingestion] enregistrement ingest_runs échoué :', (e as Error).message)
  }
}
