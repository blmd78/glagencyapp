import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSubsVolumes, subscribeVolumesUrl } from './subscriptions'

// Fixture = capture RÉELLE de /api/v2.0/subscribe/volumes (compte Alice, sept. 2026).
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const raw = JSON.parse(readFileSync(resolve(dir, 'subscribe-volumes.json'), 'utf8'))

describe('parseSubsVolumes — série journalière { new, canceled, current }', () => {
  const rows = parseSubsVolumes(raw)

  it('une ligne par jour, triée par date croissante, en ISO', () => {
    expect(rows).toHaveLength(7)
    expect(rows.map((r) => r.day)).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
    ])
  })

  it('lit les abonnés actifs (current)', () => {
    expect(rows[0]).toEqual({ day: '2026-09-01', new: 0, canceled: 0, current: 751 })
  })

  it('lit un nouvel abonné (new=1 le 05/09, current passe à 752)', () => {
    expect(rows[4]).toEqual({ day: '2026-09-05', new: 1, canceled: 0, current: 752 })
  })

  it('lit un désabonnement (canceled=1 le 07/09, current retombe à 752)', () => {
    expect(rows[6]).toEqual({ day: '2026-09-07', new: 0, canceled: 1, current: 752 })
  })
})

describe('subscribeVolumesUrl', () => {
  it('cible /api/v2.0/subscribe/volumes avec start/end encodés', () => {
    const url = subscribeVolumesUrl('2026-08-31T22:00:00.000Z', '2026-09-07T21:59:59.999Z')
    expect(url).toContain('/api/v2.0/subscribe/volumes?')
    expect(url).toContain('start=2026-08-31T22%3A00%3A00.000Z')
    expect(url).toContain('end=2026-09-07T21%3A59%3A59.999Z')
  })
})
