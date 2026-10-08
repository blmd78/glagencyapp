import { describe, expect, it } from 'vitest'
import { PREPARE_PENDING, prepareOnce, type PrepareClaims } from './prepare-once'

/** Réservations en mémoire : une clé = une préparation ; absente = libérée (ou jamais prise). */
function claims() {
  const rows = new Map<string, string | null>()
  const log: string[] = []
  const c: PrepareClaims = {
    claim: async (key) => {
      log.push(`claim ${key}`)
      if (rows.has(key)) return false
      rows.set(key, null)
      return true
    },
    lookup: async (key) => {
      if (!rows.has(key)) return { status: 'released' }
      const importId = rows.get(key)
      return importId ? { status: 'done', importId } : { status: 'pending' }
    },
    complete: async (key, importId) => {
      log.push(`complete ${key} ${importId}`)
      rows.set(key, importId)
    },
    release: async (key) => {
      log.push(`release ${key}`)
      rows.delete(key)
    },
  }
  return { c, rows, log }
}
const noSleep = async () => {}

describe('prepareOnce', () => {
  it('première requête : réserve la clé, prépare, enregistre l’import', async () => {
    const { c, log } = claims()
    expect(await prepareOnce(c, 'k1', async () => 'imp-1', { sleep: noSleep })).toBe('imp-1')
    expect(log).toEqual(['claim k1', 'complete k1 imp-1'])
  })

  it('copie de la MÊME requête pendant la préparation : ne relance rien, attend et rend le même import', async () => {
    const { c, rows } = claims()
    rows.set('k1', null)
    let polls = 0
    let worked = false
    const sleep = async () => {
      polls++
      if (polls === 3) rows.set('k1', 'imp-1')
    }
    const work = async () => {
      worked = true
      return 'imp-2'
    }
    expect(await prepareOnce(c, 'k1', work, { sleep, waitMs: 60_000, stepMs: 2_000 })).toBe('imp-1')
    expect(worked).toBe(false)
  })

  it('copie pendant une préparation qui ÉCHOUE (clé libérée) : la copie reprend la clé et prépare elle-même', async () => {
    const { c, rows, log } = claims()
    rows.set('k1', null)
    const sleep = async () => {
      rows.delete('k1') // la première a échoué et libéré la clé
    }
    expect(await prepareOnce(c, 'k1', async () => 'imp-2', { sleep, waitMs: 60_000, stepMs: 2_000 })).toBe('imp-2')
    expect(log).toEqual(['claim k1', 'claim k1', 'complete k1 imp-2'])
  })

  it('copie qui attend trop longtemps : refus lisible (« déjà en cours »), toujours sans relancer', async () => {
    const { c, rows } = claims()
    rows.set('k1', null)
    await expect(prepareOnce(c, 'k1', async () => 'imp-2', { sleep: noSleep, waitMs: 6_000, stepMs: 2_000 })).rejects.toThrow(PREPARE_PENDING)
  })

  it('préparation en échec : la clé est libérée (un nouvel essai reste possible) et l’erreur remonte', async () => {
    const { c, rows, log } = claims()
    await expect(prepareOnce(c, 'k1', async () => Promise.reject(new Error('conversion')), { sleep: noSleep })).rejects.toThrow('conversion')
    expect(rows.has('k1')).toBe(false)
    expect(log).toEqual(['claim k1', 'release k1'])
  })

  it('rattachement clé → import en échec APRÈS la création : l’import est rendu quand même, la panne est signalée', async () => {
    const { c } = claims()
    const reported: unknown[] = []
    const broken: PrepareClaims = {
      ...c,
      complete: async () => {
        throw new Error('supabase 503')
      },
    }
    expect(await prepareOnce(broken, 'k1', async () => 'imp-1', { sleep: noSleep, report: (e) => reported.push(e) })).toBe('imp-1')
    expect(reported).toHaveLength(1)
  })
})
