import { describe, expect, it } from 'vitest'
import { ALL, modeleOptions, parseModele, resolveGraphSelection, SANS_MODELE, sumLinks } from './link-options'
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
      ALL,
    )

    expect(options.map((o) => o.value)).toEqual([ALL, 'gros', 'petit', 'muet'])
  })

  it('dit dans le libellé qu un lien n a rien fait sur la période', () => {
    const { options } = resolveGraphSelection([link({ id: 'm', name: 'Bio Twitter' })], ALL, ALL, ALL)

    expect(options[1].label).toContain('Bio Twitter')
    expect(options[1].label).toContain('sans activité')
  })

  it('ne propose que les liens du réseau choisi', () => {
    const links = [link({ id: 'tw', type: 'twitter' }), link({ id: 'ig', type: 'instagram' })]

    const { options } = resolveGraphSelection(links, 'instagram', ALL, ALL)

    expect(options.map((o) => o.value)).toEqual([ALL, 'ig'])
  })

  it('retient TOUS les liens du réseau quand le lien vaut « tous »', () => {
    const links = [
      link({ id: 'tw', type: 'twitter' }),
      link({ id: 'ig1', type: 'instagram' }),
      link({ id: 'ig2', type: 'instagram' }),
    ]

    const { selected } = resolveGraphSelection(links, 'instagram', ALL, ALL)

    expect(selected.map((l) => l.id)).toEqual(['ig1', 'ig2'])
  })

  it('fait retomber sur « tous » un lien qui n appartient pas au réseau choisi', () => {
    // Sinon l'écran se contredit : le champ Réseau dit Instagram, la courbe montre un Twitter.
    const links = [link({ id: 'tw', type: 'twitter' }), link({ id: 'ig', type: 'instagram' })]

    const { lien, selected } = resolveGraphSelection(links, 'instagram', ALL, 'tw')

    expect(lien).toBe(ALL)
    expect(selected.map((l) => l.id)).toEqual(['ig'])
  })
})

describe('axe modèle', () => {
  const carla = '11111111-1111-1111-1111-111111111111'
  const lena = '22222222-2222-2222-2222-222222222222'
  const liens = [
    link({ id: 'c1', creatorId: carla, creator: 'Carla' }),
    link({ id: 'c2', creatorId: carla, creator: 'Carla', type: 'instagram' }),
    link({ id: 'l1', creatorId: lena, creator: 'Léna' }),
    link({ id: 'orphelin' }),
  ]

  it('ne retient que les liens de la modèle choisie, tous réseaux confondus', () => {
    // C'est TOUT le besoin : sur MyPuls il faut ouvrir les liens un par un.
    const { selected } = resolveGraphSelection(liens, ALL, carla, ALL)

    expect(selected.map((l) => l.id)).toEqual(['c1', 'c2'])
  })

  it('croise le réseau et la modèle', () => {
    const { selected } = resolveGraphSelection(liens, 'instagram', carla, ALL)

    expect(selected.map((l) => l.id)).toEqual(['c2'])
  })

  it('fait retomber sur « tous » un lien qui n appartient pas à la modèle choisie', () => {
    // Même garantie que pour le réseau : l'écran ne doit pas pouvoir se contredire.
    const { lien, selected } = resolveGraphSelection(liens, ALL, carla, 'l1')

    expect(lien).toBe(ALL)
    expect(selected.map((l) => l.id)).toEqual(['c1', 'c2'])
  })

  it('isole les liens sans modèle rattachée', () => {
    const { selected } = resolveGraphSelection(liens, ALL, SANS_MODELE, ALL)

    expect(selected.map((l) => l.id)).toEqual(['orphelin'])
  })

  it('propose les modèles par ordre alphabétique, « sans modèle » en dernier', () => {
    expect(modeleOptions(liens).map((o) => o.label)).toEqual([
      'Toutes les modèles',
      'Carla',
      'Léna',
      'Sans modèle',
    ])
  })

  it('n offre pas « sans modèle » quand tous les liens sont rattachés', () => {
    const values = modeleOptions([link({ id: 'c1', creatorId: carla, creator: 'Carla' })]).map((o) => o.value)

    expect(values).toEqual([ALL, carla])
  })

  it('ignore une modèle dont le nom est hors du périmètre de lecture', () => {
    // Sous RLS, un non-admin lit le lien mais pas le nom de la modèle : une option muette
    // n'aurait aucun libellé à afficher. Le lien reste visible dans « toutes les modèles ».
    const values = modeleOptions([link({ id: 'x', creatorId: carla, creator: null })]).map((o) => o.value)

    expect(values).toEqual([ALL])
  })

  it('refuse un ?modele= inconnu et retombe sur « toutes »', () => {
    expect(parseModele('pas-une-modele', liens)).toBe(ALL)
    expect(parseModele(undefined, liens)).toBe(ALL)
    expect(parseModele(carla, liens)).toBe(carla)
    expect(parseModele(SANS_MODELE, liens)).toBe(SANS_MODELE)
  })

  it('refuse « sans modèle » quand aucun lien n est orphelin', () => {
    const rattaches = [link({ id: 'c1', creatorId: carla, creator: 'Carla' })]

    expect(parseModele(SANS_MODELE, rattaches)).toBe(ALL)
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

  it('recalcule le taux Σabonnés/Σclics, jamais la moyenne des taux', () => {
    // 1/10 et 10/90 : la moyenne des deux taux dirait 10,6 %, la vérité est 11/100 = 11 %.
    const t = sumLinks([
      link({ id: 'a', clicks: 10, conversions: 1, taux: 10 }),
      link({ id: 'b', clicks: 90, conversions: 10, taux: 11.1 }),
    ])

    expect(t.taux).toBe(11)
  })

  it('rend un taux nul sans aucun clic', () => {
    expect(sumLinks([link({ id: 'a', conversions: 3 })]).taux).toBeNull()
  })
})
