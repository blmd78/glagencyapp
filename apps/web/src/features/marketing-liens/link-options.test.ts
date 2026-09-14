import { describe, expect, it } from 'vitest'
import { ALL, resolveGraphSelection, sumLinks } from './link-options'
import type { MktLinkRow } from '@/lib/types/marketing'

const link = (o: Partial<MktLinkRow> & { id: string }): MktLinkRow => ({
  name: o.id, type: 'twitter', url: '', creatorId: null, creator: null, staff: [], active: true,
  clicks: 0, conversions: 0, revenueEur: 0, ltv: null, taux: null, ...o,
})

describe('resolveGraphSelection', () => {
  it('place les liens qui ont bougé avant les dormants, classés par abonnés', () => {
    // L'agence porte 183 liens dont ~55 bougent un jour donné : ouvrir le sélecteur sur une
    // liste de liens morts obligerait à chercher le seul qui compte.
    const { options } = resolveGraphSelection(
      [link({ id: 'muet' }), link({ id: 'petit', conversions: 2 }), link({ id: 'gros', conversions: 40 })],
      ALL,
      ALL,
    )

    expect(options.map((o) => o.value)).toEqual([ALL, 'gros', 'petit', 'muet'])
  })

  it('dit dans le libellé qu un lien n a rien fait sur la période', () => {
    const { options } = resolveGraphSelection([link({ id: 'm', name: 'Bio Twitter' })], ALL, ALL)

    expect(options[1].label).toContain('Bio Twitter')
    expect(options[1].label).toContain('sans activité')
  })

  it('ne propose que les liens du réseau choisi', () => {
    const links = [link({ id: 'tw', type: 'twitter' }), link({ id: 'ig', type: 'instagram' })]

    const { options } = resolveGraphSelection(links, 'instagram', ALL)

    expect(options.map((o) => o.value)).toEqual([ALL, 'ig'])
  })

  it('retient TOUS les liens du réseau quand le lien vaut « tous »', () => {
    const links = [
      link({ id: 'tw', type: 'twitter' }),
      link({ id: 'ig1', type: 'instagram' }),
      link({ id: 'ig2', type: 'instagram' }),
    ]

    const { selected } = resolveGraphSelection(links, 'instagram', ALL)

    expect(selected.map((l) => l.id)).toEqual(['ig1', 'ig2'])
  })

  it('fait retomber sur « tous » un lien qui n appartient pas au réseau choisi', () => {
    // Sinon l'écran se contredit : le champ Réseau dit Instagram, la courbe montre un Twitter.
    const links = [link({ id: 'tw', type: 'twitter' }), link({ id: 'ig', type: 'instagram' })]

    const { lien, selected } = resolveGraphSelection(links, 'instagram', 'tw')

    expect(lien).toBe(ALL)
    expect(selected.map((l) => l.id)).toEqual(['ig'])
  })
})

describe('sumLinks', () => {
  it('recalcule le € par abonné Σrevenus/Σabonnés, jamais la moyenne des LTV', () => {
    // 100 €/1 ab. et 10 €/ab. sur 10 : la moyenne des deux LTV dirait 55 €, la vérité est
    // 200 € ÷ 11 abonnés = 18,18 €.
    const t = sumLinks([
      link({ id: 'a', conversions: 1, revenueEur: 100, clicks: 10, ltv: 100 }),
      link({ id: 'b', conversions: 10, revenueEur: 100, clicks: 90, ltv: 10 }),
    ])

    expect(t.ltv).toBe(18.18)
    expect(t.clicks).toBe(100)
    expect(t.conversions).toBe(11)
    expect(t.revenueEur).toBe(200)
  })

  it('rend un € par abonné nul quand personne ne s est abonné', () => {
    expect(sumLinks([link({ id: 'a', clicks: 40 })]).ltv).toBeNull()
  })
})
