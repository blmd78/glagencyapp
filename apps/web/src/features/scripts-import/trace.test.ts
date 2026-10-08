import { describe, expect, it } from 'vitest'
import type { StudioWriter } from '@glagency/scripts'
import { withCreationTrace } from './trace'

const base = { createScript: async () => 42 } as unknown as StudioWriter

describe('withCreationTrace', () => {
  it('enregistre l’id du script dès sa création', async () => {
    const seen: number[] = []
    const w = withCreationTrace(base, async (id) => {
      seen.push(id)
    }, () => {})
    expect(await w.createScript({ name: 'S' })).toBe(42)
    expect(seen).toEqual([42])
  })
  it('une panne de la trace ne fait PAS échouer la création (le script existe chez MyPuls) : elle est signalée', async () => {
    const reported: unknown[] = []
    const w = withCreationTrace(
      base,
      async () => {
        throw new Error('supabase 503')
      },
      (e) => reported.push(e),
    )
    expect(await w.createScript({ name: 'S' })).toBe(42)
    expect(reported).toHaveLength(1)
  })
})
