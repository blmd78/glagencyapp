/** Où en est la requête qui a réservé une clé de « Préparer » (`script_prepare_requests`, 0189). */
export type PrepareState = { status: 'pending' } | { status: 'done'; importId: string } | { status: 'released' }

/** Une lecture : l'état de la clé, ou le refus du serveur (« en tant que », session expirée) et son message. */
export type ReadResult = PrepareState | { status: 'refused'; message: string }

export type WaitOutcome =
  | { status: 'done'; importId: string }
  | { status: 'failed' }
  | { status: 'timeout' }
  | { status: 'refused'; message: string }
  | { status: 'aborted' }

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** `p`, ou `null` passé `ms` (minuterie réelle, libérée dès que `p` répond). */
function bounded<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

/**
 * Après une réponse coupée (test réel du 2026-10-08 : connexion perdue à 60 s pendant que le serveur
 * finissait la conversion à 63 s) : la préparation continue côté serveur. On relit sa clé (`read`) jusqu'à
 * l'issue — l'import à ouvrir ; `refused` (le serveur refuse la lecture : on s'arrête, avec son message) ;
 * `failed` si la clé est libérée (préparation échouée) — mais une clé absente n'est « échouée » qu'après
 * l'avoir vue en cours, ou passé `minReleasedMs` (sinon la requête n'est peut-être pas encore réservée
 * côté serveur : démarrage à froid, contrôles d'accès) ; `timeout` à l'échéance (`waitMs`, temps des
 * lectures compris) ; `aborted` si `signal` coupe (page quittée). Une lecture en panne, ou sans réponse
 * passé `readMs`, ne conclut rien : on relit.
 */
export async function waitPrepared(
  read: () => Promise<ReadResult>,
  opts: {
    waitMs?: number
    stepMs?: number
    readMs?: number
    minReleasedMs?: number
    signal?: AbortSignal
    sleep?: (ms: number) => Promise<void>
    now?: () => number
  } = {},
): Promise<WaitOutcome> {
  const { waitMs = 180_000, stepMs = 3_000, readMs = 10_000, minReleasedMs = 15_000, signal, sleep = realSleep, now = Date.now } = opts
  const start = now()
  const deadline = start + waitMs
  let seenPending = false
  while (now() < deadline) {
    await sleep(Math.min(stepMs, deadline - now()))
    const left = deadline - now()
    if (signal?.aborted) return { status: 'aborted' }
    if (left <= 0) break
    const state = await bounded(read().catch(() => null), Math.min(readMs, left))
    if (signal?.aborted) return { status: 'aborted' }
    if (state?.status === 'done' || state?.status === 'refused') return state
    if (state?.status === 'pending') seenPending = true
    if (state?.status === 'released' && (seenPending || now() - start >= minReleasedMs)) return { status: 'failed' }
  }
  return { status: 'timeout' }
}
