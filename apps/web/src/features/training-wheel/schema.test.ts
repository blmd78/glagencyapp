import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { wheelConfigForm } from './schema'

// Le formulaire de configuration vient d'inputs HTML : tout arrive en CHAÎNE (poids, montant).
// Ces tests fixent les deux contrats qui comptent — la coercition (dont `''` → null pour un lot
// non monétaire) et les deux refines qui empêchent une roue intirable (`pickWeighted` throw si la
// somme des poids vaut 0).

const base = {
  title: 'Roue de la chance',
  sectors: [
    { label: 'Cadeau', weight: '80', lose: false },
    { label: 'Raté', weight: '20', lose: true },
  ],
  prizes: [
    { label: '5 €', weight: '60', amountEur: '5' },
    { label: 'Day off supplémentaire', weight: '5', amountEur: '' },
  ],
}

const fieldErrors = (r: z.ZodSafeParseResult<unknown>): Record<string, string[] | undefined> =>
  r.success ? {} : z.flattenError(r.error).fieldErrors

describe('wheelConfigForm', () => {
  it('config valide : poids coercés, montant vide → null (lot non monétaire)', () => {
    const r = wheelConfigForm.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.sectors[0].weight).toBe(80)
      expect(r.data.sectors[1].lose).toBe(true)
      expect(r.data.prizes[0].amountEur).toBe(5)
      expect(r.data.prizes[1].amountEur).toBeNull()
    }
  })

  it('refuse une roue sans secteur gagnant (tous perdants ou poids 0)', () => {
    const allLose = wheelConfigForm.safeParse({
      ...base,
      sectors: [{ label: 'Raté', weight: '20', lose: true }],
    })
    expect(allLose.success).toBe(false)
    expect(fieldErrors(allLose).sectors).toContain('Il faut au moins un secteur gagnant avec un poids > 0')

    const zeroWeight = wheelConfigForm.safeParse({
      ...base,
      sectors: [
        { label: 'Cadeau', weight: '0', lose: false },
        { label: 'Raté', weight: '20', lose: true },
      ],
    })
    expect(zeroWeight.success).toBe(false)
    expect(fieldErrors(zeroWeight).sectors).toContain('Il faut au moins un secteur gagnant avec un poids > 0')
  })

  it('refuse un coffre dont tous les lots ont un poids nul', () => {
    const r = wheelConfigForm.safeParse({ ...base, prizes: [{ label: '5 €', weight: '0', amountEur: '5' }] })
    expect(r.success).toBe(false)
    expect(fieldErrors(r).prizes).toContain('Il faut au moins un lot avec un poids > 0')
  })

  it('refuse un poids négatif, un poids décimal et un montant négatif', () => {
    expect(wheelConfigForm.safeParse({ ...base, sectors: [{ label: 'Cadeau', weight: '-1', lose: false }] }).success).toBe(false)
    expect(wheelConfigForm.safeParse({ ...base, sectors: [{ label: 'Cadeau', weight: '1.5', lose: false }] }).success).toBe(false)
    expect(wheelConfigForm.safeParse({ ...base, prizes: [{ label: '5 €', weight: '60', amountEur: '-5' }] }).success).toBe(false)
  })

  it('refuse un titre vide, une liste vide et un libellé vide', () => {
    expect(wheelConfigForm.safeParse({ ...base, title: '  ' }).success).toBe(false)
    expect(fieldErrors(wheelConfigForm.safeParse({ ...base, sectors: [] })).sectors).toContain('Au moins un secteur')
    expect(fieldErrors(wheelConfigForm.safeParse({ ...base, prizes: [] })).prizes).toContain('Au moins un lot')
    expect(wheelConfigForm.safeParse({ ...base, prizes: [{ label: '', weight: '60', amountEur: '5' }] }).success).toBe(false)
  })
})
