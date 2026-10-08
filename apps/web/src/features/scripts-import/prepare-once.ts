import { BusinessError } from '@/lib/actions'

/**
 * Réservation d'une clé de préparation (table `script_prepare_requests`, 0189) : une clé = UN clic sur
 * « Préparer », générée par le navigateur. Les copies d'une même requête (renvoi par le navigateur,
 * test réel du 2026-10-08 : deux préparations à 55 s d'écart pour un seul clic) portent la même clé.
 */
export interface PrepareClaims {
  /** Réserve la clé : `true` si elle est à nous, `false` si une requête l'a déjà prise. */
  claim(key: string): Promise<boolean>
  /** Où en est la requête qui a réservé la clé : en cours, faite (son import), ou clé libérée (échec). */
  lookup(key: string): Promise<{ status: 'pending' } | { status: 'done'; importId: string } | { status: 'released' }>
  complete(key: string, importId: string): Promise<void>
  /** Libère la clé après un échec : un nouvel essai reste possible. */
  release(key: string): Promise<void>
}

export const PREPARE_PENDING =
  'Cette préparation est déjà en cours : le rapport apparaîtra dans l’historique d’ici une minute — si rien n’apparaît, relance « Préparer ».'

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Prépare UNE fois par clé. La requête qui réserve la clé prépare (`work`) et rattache l'import à la clé ;
 * une copie ne relance rien (une conversion Claude de trop, sinon) : elle attend l'import de la première
 * et le rend. Si la première échoue (clé libérée), la copie reprend la clé et prépare elle-même — c'est
 * peut-être la seule réponse que lira le navigateur. Passé `waitMs` sans issue : refus lisible.
 * Échec de `work` : clé libérée, erreur remontée. Échec du seul rattachement : l'import existe, on le
 * rend quand même (`report` signale la panne) — sinon l'utilisateur recliquerait et reconvertirait.
 */
export async function prepareOnce(
  claims: PrepareClaims,
  key: string,
  work: () => Promise<string>,
  opts: { waitMs?: number; stepMs?: number; sleep?: (ms: number) => Promise<void>; report?: (e: unknown) => void } = {},
): Promise<string> {
  const { waitMs = 180_000, stepMs = 2_000, sleep = realSleep, report = () => {} } = opts
  let waited = 0
  for (;;) {
    if (await claims.claim(key)) {
      let importId: string
      try {
        importId = await work()
      } catch (e) {
        await claims.release(key)
        throw e
      }
      await claims.complete(key, importId).catch(report)
      return importId
    }
    while (waited < waitMs) {
      await sleep(stepMs)
      waited += stepMs
      const state = await claims.lookup(key)
      if (state.status === 'done') return state.importId
      if (state.status === 'released') break
    }
    if (waited >= waitMs) throw new BusinessError(PREPARE_PENDING)
  }
}
