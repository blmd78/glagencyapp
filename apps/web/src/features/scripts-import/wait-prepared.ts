/** Où en est la requête qui a réservé une clé de « Préparer » (`script_prepare_requests`, 0189). */
export type PrepareState = { status: 'pending' } | { status: 'done'; importId: string } | { status: 'released' }

export type WaitOutcome = { status: 'done'; importId: string } | { status: 'failed' } | { status: 'timeout' }

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Après une réponse coupée (test réel du 2026-10-08 : connexion perdue à 60 s pendant que le serveur
 * finissait la conversion à 63 s) : la préparation continue côté serveur. On relit sa clé (`read`) jusqu'à
 * l'issue — l'import à ouvrir, `failed` si la clé est libérée (préparation échouée), `timeout` passé
 * `waitMs`. Une lecture en panne ne conclut rien : on relit.
 */
export async function waitPrepared(
  read: () => Promise<PrepareState>,
  opts: { waitMs?: number; stepMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<WaitOutcome> {
  const { waitMs = 180_000, stepMs = 3_000, sleep = realSleep } = opts
  for (let waited = 0; waited < waitMs; waited += stepMs) {
    await sleep(stepMs)
    const state = await read().catch(() => null)
    if (state?.status === 'done') return state
    if (state?.status === 'released') return { status: 'failed' }
  }
  return { status: 'timeout' }
}
