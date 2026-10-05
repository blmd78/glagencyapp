import { describe, expect, it } from 'vitest'
import { staleAfterCheck, type Photo } from './recette-identite'

// Recette : par jour, photo « avant » (ancien code rejoué), PUIS rejeu du nouveau code, puis photo
// « après ». Le verdict ingest_day_checks de la photo « après » doit venir de CE rejeu : écrit après la
// photo « avant ». Sinon (rejeu en échec), la photo montrerait un verdict d'un rejeu précédent.

const photo = (o: { takenAt?: string; checkedAt?: string | null; check?: boolean } = {}): Photo => ({
  takenAt: o.takenAt,
  snapshot: { day: '2026-09-06', cd: {}, ccd: {}, fiches: {} },
  issues: [],
  check:
    o.check === false
      ? null
      : { status: 'ok', checks: [], ...(o.checkedAt === null ? {} : { checked_at: o.checkedAt ?? '2026-10-05T10:05:00.000Z' }) },
})

describe('staleAfterCheck — le verdict « après » vient-il du rejeu du nouveau code ?', () => {
  const avant = photo({ takenAt: '2026-10-05T10:00:00.000Z' })

  it('verdict écrit après la photo « avant » → frais (null)', () => {
    expect(staleAfterCheck(avant, photo({ checkedAt: '2026-10-05T10:05:00.000Z' }))).toBeNull()
  })

  it('verdict antérieur à la photo « avant » → refus explicite (rejeu raté)', () => {
    const r = staleAfterCheck(avant, photo({ checkedAt: '2026-10-05T09:00:00.000Z' }))
    expect(r).toContain('antérieur à la photo « avant »')
  })

  it('verdict écrit à la même milliseconde que la photo « avant » → refus (pas prouvé postérieur)', () => {
    expect(staleAfterCheck(avant, photo({ checkedAt: '2026-10-05T10:00:00.000Z' }))).not.toBeNull()
  })

  it('aucun verdict dans la photo « après » → refus explicite', () => {
    expect(staleAfterCheck(avant, photo({ check: false }))).toContain('aucun verdict')
  })

  it('photo « après » sans checked_at (ancien format) → refus explicite', () => {
    expect(staleAfterCheck(avant, photo({ checkedAt: null }))).toContain('checked_at')
  })

  it('photo « avant » sans heure de prise (ancien format) → refus explicite', () => {
    expect(staleAfterCheck(photo(), photo())).toContain('heure de prise')
  })
})
