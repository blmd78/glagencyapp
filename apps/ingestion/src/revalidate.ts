/**
 * Prévient le dashboard qu'un run vient d'écrire des faits → expire les caches taggés.
 *
 * Partagé par le CLI (`main.ts`) et le Worker (`worker.ts`). Seul consommateur du tag
 * aujourd'hui : `get-ranking` (`chatter_daily` + présence MyPuls).
 */
export async function pingRevalidate(): Promise<void> {
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
