import { describe, expect, it } from 'vitest'
import { waitPrepared, type PrepareState } from './wait-prepared'

/** Lectures successives de la clé : un état, ou une panne de la lecture elle-même. */
function reads(...states: (PrepareState | Error)[]) {
  let i = 0
  const slept: number[] = []
  return {
    read: async () => {
      const s = states[Math.min(i++, states.length - 1)]!
      if (s instanceof Error) throw s
      return s
    },
    sleep: async (ms: number) => void slept.push(ms),
    slept,
    count: () => i,
  }
}

describe('waitPrepared (réponse de « Préparer » coupée, la préparation continue côté serveur)', () => {
  it('relit la clé jusqu’à l’import, en laissant d’abord le serveur travailler', async () => {
    const r = reads({ status: 'pending' }, { status: 'pending' }, { status: 'done', importId: 'imp-1' })
    expect(await waitPrepared(r.read, { sleep: r.sleep })).toEqual({ status: 'done', importId: 'imp-1' })
    expect(r.slept).toEqual([3000, 3000, 3000])
  })

  it('clé libérée (la préparation a échoué) : échec, sans attendre plus', async () => {
    const r = reads({ status: 'pending' }, { status: 'released' })
    expect(await waitPrepared(r.read, { sleep: r.sleep })).toEqual({ status: 'failed' })
    expect(r.count()).toBe(2)
  })

  it('une lecture en panne (réseau) ne conclut rien : on relit', async () => {
    const r = reads(new Error('Failed to fetch'), { status: 'done', importId: 'imp-2' })
    expect(await waitPrepared(r.read, { sleep: r.sleep })).toEqual({ status: 'done', importId: 'imp-2' })
  })

  it('toujours en cours au bout de l’attente : délai dépassé (3 min par défaut)', async () => {
    const r = reads({ status: 'pending' })
    expect(await waitPrepared(r.read, { sleep: r.sleep })).toEqual({ status: 'timeout' })
    expect(r.count()).toBe(60)
    expect(r.slept.reduce((a, b) => a + b, 0)).toBe(180_000)
  })
})
