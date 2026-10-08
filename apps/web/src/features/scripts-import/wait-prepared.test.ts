import { describe, expect, it } from 'vitest'
import { waitPrepared, type ReadResult } from './wait-prepared'

/**
 * Lectures successives de la clé (un état, une panne, ou une lecture qui ne répond jamais) sur une
 * horloge simulée : `sleep` et chaque lecture (`readCost`) la font avancer.
 */
function reads(states: (ReadResult | Error | 'hang')[], readCost = 0) {
  let i = 0
  let clock = 0
  const slept: number[] = []
  return {
    read: async () => {
      const s = states[Math.min(i++, states.length - 1)]!
      clock += readCost
      if (s === 'hang') return new Promise<ReadResult>(() => {})
      if (s instanceof Error) throw s
      return s
    },
    sleep: async (ms: number) => {
      slept.push(ms)
      clock += ms
    },
    now: () => clock,
    slept,
    count: () => i,
  }
}

describe('waitPrepared (réponse de « Préparer » coupée, la préparation continue côté serveur)', () => {
  it('relit la clé jusqu’à l’import, en laissant d’abord le serveur travailler', async () => {
    const r = reads([{ status: 'pending' }, { status: 'pending' }, { status: 'done', importId: 'imp-1' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'done', importId: 'imp-1' })
    expect(r.slept).toEqual([3000, 3000, 3000])
  })

  it('clé libérée (la préparation a échoué) : échec, sans attendre plus', async () => {
    const r = reads([{ status: 'pending' }, { status: 'released' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'failed' })
    expect(r.count()).toBe(2)
  })

  it('une lecture en panne (réseau) ne conclut rien : on relit', async () => {
    const r = reads([new Error('Failed to fetch'), { status: 'done', importId: 'imp-2' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'done', importId: 'imp-2' })
  })

  it('toujours en cours au bout de l’attente : délai dépassé (3 min par défaut)', async () => {
    const r = reads([{ status: 'pending' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'timeout' })
    // Une lecture toutes les 3 s ; aucune à l'échéance même (plus de temps pour l'attendre).
    expect(r.count()).toBe(59)
    expect(r.slept.reduce((a, b) => a + b, 0)).toBe(180_000)
  })

  it('le temps des lectures compte dans les 3 min (réseau lent) : le bouton ne reste pas occupé au-delà', async () => {
    const r = reads([{ status: 'pending' }], 20_000)
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'timeout' })
    expect(r.count()).toBe(8)
    expect(r.now()).toBeLessThanOrEqual(180_000 + 20_000)
  })

  it('une lecture qui ne répond jamais est abandonnée, puis relue', async () => {
    const r = reads(['hang', { status: 'done', importId: 'imp-3' }])
    expect(await waitPrepared(r.read, { ...r, readMs: 5 })).toEqual({ status: 'done', importId: 'imp-3' })
  })

  it('lecture refusée par le serveur (« en tant que », session expirée) : arrêt immédiat, avec son message', async () => {
    const r = reads([{ status: 'refused', message: 'Action interdite en mode « en tant que ».' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'refused', message: 'Action interdite en mode « en tant que ».' })
    expect(r.count()).toBe(1)
  })

  it('clé absente au début (requête pas encore réservée côté serveur) : pas « échouée » avant 15 s', async () => {
    const r = reads([{ status: 'released' }, { status: 'released' }, { status: 'pending' }, { status: 'done', importId: 'imp-4' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'done', importId: 'imp-4' })
  })

  it('clé toujours absente passé 15 s, sans jamais avoir été vue en cours : échouée', async () => {
    const r = reads([{ status: 'released' }])
    expect(await waitPrepared(r.read, r)).toEqual({ status: 'failed' })
    expect(r.now()).toBe(15_000)
  })

  it('page quittée pendant l’attente : arrêt, sans issue à afficher', async () => {
    const c = new AbortController()
    const r = reads([{ status: 'pending' }])
    const read = async () => {
      const s = await r.read()
      c.abort()
      return s
    }
    expect(await waitPrepared(read, { ...r, signal: c.signal })).toEqual({ status: 'aborted' })
    expect(r.count()).toBe(1)
  })
})
