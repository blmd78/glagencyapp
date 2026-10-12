import { describe, expect, it } from 'vitest'
import type { SharedPage } from '@glagency/scripts/notion'
import { organizeNotionPages } from './notion-pages'

const creators = [
  { id: 'c-emma', name: 'Emma' },
  { id: 'c-lucie', name: 'Lucie' },
  { id: 'c-julie', name: 'Julie' },
  { id: 'c-julie-p', name: 'Julie (privé)' },
]
/** Vue admin par défaut : toutes les modèles dans le périmètre de l'appelant. */
const organize = (pages: SharedPage[], list = creators, allowed = list.map((c) => c.id)) => organizeNotionPages(pages, list, new Set(allowed))

describe('organizeNotionPages', () => {
  it('modèle reconnue par le DOSSIER parent direct (EMMA = Emma), où que soit ce dossier', () => {
    const r = organize(
      [
        { id: 'root', title: 'SCRIPTS MYPULS', parentId: null },
        { id: 'f-emma', title: 'EMMA', parentId: 'root' },
        { id: 's1', title: 'Script de vente V3', parentId: 'f-emma' },
        { id: 's2', title: 'KYC', parentId: 'f-emma' },
      ],
      creators,
    )
    expect(r.recognized).toEqual([
      {
        id: 'modele:c-emma',
        title: 'Emma',
        creatorId: 'c-emma',
        scripts: [
          { id: 's2', title: 'KYC' },
          { id: 's1', title: 'Script de vente V3' },
        ],
      },
    ])
  })

  it('sinon par la FIN DU TITRE (« … · Lucie ») — le cas d’OUTILS MANAGERS', () => {
    const r = organize(
      [
        { id: 'om', title: 'OUTILS MANAGERS', parentId: null },
        { id: 'k', title: 'Script découverte (KYC) · Lucie', parentId: 'om' },
        { id: 'v', title: 'Script de vente · Julie (privé)', parentId: 'om' },
      ],
      creators,
    )
    expect(r.recognized.map((g) => [g.creatorId, g.scripts.map((s) => s.id)])).toEqual([
      ['c-julie-p', ['v']],
      ['c-lucie', ['k']],
    ])
  })

  it('le reste dans « autres », groupé par dossier parent ; un dossier de modèle n’est pas pris pour un script', () => {
    const r = organize(
      [
        { id: 'om', title: 'OUTILS MANAGERS', parentId: null },
        { id: 'p1', title: 'Prompt – Script de vente V3', parentId: 'om' },
        { id: 'f-emma', title: 'EMMA', parentId: null },
        { id: 'm1', title: 'Photo 1', parentId: 'k' },
        { id: 'k', title: 'Script découverte (KYC) · Lucie', parentId: 'om' },
      ],
      creators,
    )
    expect(r.recognized.map((g) => g.creatorId)).toEqual(['c-lucie'])
    // Le prompt (p1) n'apparaît nulle part : il ne s'importe jamais.
    expect(r.others).toEqual([
      { id: 'parent:k', title: 'Script découverte (KYC) · Lucie', creatorId: null, scripts: [{ id: 'm1', title: 'Photo 1' }] },
      {
        id: 'parent:',
        title: 'Sans dossier',
        creatorId: null,
        scripts: [
          { id: 'f-emma', title: 'EMMA' },
          { id: 'om', title: 'OUTILS MANAGERS' },
        ],
      },
    ])
  })

  const recognizedIds = (r: ReturnType<typeof organizeNotionPages>) => r.recognized.map((g) => [g.creatorId, g.scripts.map((s) => s.id)])

  it('titre : prénom n’importe où, quel que soit le séparateur', () => {
    const r = organize(
      [
        { id: 'a', title: 'Script KYC - Lucie', parentId: null },
        { id: 'b', title: 'Script Lucie relance', parentId: null },
        { id: 'c', title: '🔥 Relance (EMMA)', parentId: null },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-emma', ['c']],
      ['c-lucie', ['a', 'b']],
    ])
  })

  it('dossier : nom de la modèle entouré de mots génériques (« Scripts Emma », « 📁 Lucie – scripts »)', () => {
    const r = organize(
      [
        { id: 'fe', title: 'Scripts Emma', parentId: null },
        { id: 'fl', title: '📁 Lucie – scripts', parentId: null },
        { id: 's1', title: 'KYC', parentId: 'fe' },
        { id: 's2', title: 'Vente V3', parentId: 'fl' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-emma', ['s1']],
      ['c-lucie', ['s2']],
    ])
    expect(r.others.flatMap((g) => g.scripts.map((s) => s.id)).sort()).toEqual(['fe', 'fl'])
  })

  it('sous-dossier générique traversé (EMMA › Scripts › KYC) ; le dossier « Scripts » n’est pas un script', () => {
    const r = organize(
      [
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'gen', title: 'Scripts', parentId: 'fe' },
        { id: 'k', title: 'KYC', parentId: 'gen' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-emma', ['k']]])
    expect(r.others.flatMap((g) => g.scripts.map((s) => s.id)).sort()).toEqual(['fe', 'gen'])
  })

  it('sous-dossier NON générique : pas traversé (EMMA › Ventes › KYC reste dans « autres »)', () => {
    const r = organize(
      [
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'v', title: 'Ventes', parentId: 'fe' },
        { id: 'k', title: 'KYC', parentId: 'v' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-emma', ['v']]])
  })

  it('une sous-page d’un script (média) n’est jamais un script, même si elle porte le prénom', () => {
    const r = organize(
      [
        { id: 'fl', title: 'LUCIE', parentId: null },
        { id: 'k', title: 'Script Lucie KYC', parentId: 'fl' },
        { id: 'm1', title: 'Photo 1', parentId: 'k' },
        { id: 'm2', title: 'Photo Lucie 2', parentId: 'k' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-lucie', ['k']]])
    expect(r.others.find((g) => g.id === 'parent:k')?.scripts.map((s) => s.id)).toEqual(['m1', 'm2'])
  })

  it('prénom en minuscule = mot courant, ignoré (« Relance claire » ≠ Claire) ; « · claire » en fin de titre reste reconnu', () => {
    const withClaire = [...creators, { id: 'c-claire', name: 'Claire' }]
    const r = organize(
      [
        { id: 'a', title: 'Relance claire et directe', parentId: null },
        { id: 'b', title: 'Script KYC · claire', parentId: null },
      ],
      withClaire,
    )
    expect(recognizedIds(r)).toEqual([['c-claire', ['b']]])
  })

  it('le nom le plus précis l’emporte (« Julie (privé) » sur Julie) ; Juliette n’est pas Julie', () => {
    const r = organize(
      [
        { id: 'a', title: 'Script vente Julie (privé)', parentId: null },
        { id: 'b', title: 'Script vente Juliette', parentId: null },
        { id: 'c', title: 'Script vente Julie', parentId: null },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-julie', ['c']],
      ['c-julie-p', ['a']],
    ])
  })

  it('deux modèles différentes (titre, ou dossier contre titre) → pas de présélection', () => {
    const r = organize(
      [
        { id: 'a', title: 'Script Emma et Lucie', parentId: null },
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'b', title: 'KYC · Lucie', parentId: 'fe' },
      ],
      creators,
    )
    expect(r.recognized).toEqual([])
  })

  it('deux modèles du même nom → pas de présélection', () => {
    const twins = [...creators, { id: 'c-emma-2', name: 'Emma' }]
    const r = organize([{ id: 'a', title: 'KYC Emma', parentId: null }], twins)
    expect(r.recognized).toEqual([])
  })

  it('périmètre partiel : la reconnaissance se fait sur TOUTES les modèles, puis hors périmètre → pas de présélection', () => {
    const pages = [
      { id: 'v', title: 'Script de vente · Julie (privé)', parentId: null },
      { id: 'fp', title: 'JULIE (PRIVÉ)', parentId: null },
      { id: 'a', title: 'Script Emma et Lucie', parentId: null },
      { id: 'fl', title: 'LUCIE', parentId: null },
      { id: 'k', title: 'KYC Emma', parentId: 'fl' },
      { id: 'j', title: 'Relance · Julie', parentId: null },
    ]
    expect(recognizedIds(organize(pages, creators, ['c-julie']))).toEqual([['c-julie', ['j']]])
    expect(organize(pages, creators, ['c-emma']).recognized).toEqual([])
  })

  it('titre tout en majuscules : le prénom au milieu ne compte pas (« RELANCE CLAIRE ET DIRECTE ») ; « · CLAIRE » en fin, oui', () => {
    const withClaire = [...creators, { id: 'c-claire', name: 'Claire' }]
    const r = organize(
      [
        { id: 'a', title: 'RELANCE CLAIRE ET DIRECTE', parentId: null },
        { id: 'b', title: 'KYC · CLAIRE', parentId: null },
      ],
      withClaire,
    )
    expect(recognizedIds(r)).toEqual([['c-claire', ['b']]])
  })

  it('« Script Emma » ou « Script · Lucie » est un script (pas un dossier) : ses pages média restent dans « autres »', () => {
    const r = organize(
      [
        { id: 'se', title: 'Script Emma', parentId: null },
        { id: 'm1', title: 'PPV 1 – 3 photos', parentId: 'se' },
        { id: 'sl', title: 'Script · Lucie', parentId: null },
        { id: 'm2', title: 'Photo 2', parentId: 'sl' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-emma', ['se']],
      ['c-lucie', ['sl']],
    ])
  })

  it('sous-dossier nommé : une sous-page « … · Prénom » reste reconnue (EMMA › Ventes › KYC · Emma, Carla VIP › KYC · Carla)', () => {
    const withCarla = [...creators, { id: 'c-carla', name: 'Carla' }]
    const r = organize(
      [
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'v', title: 'Ventes', parentId: 'fe' },
        { id: 'k', title: 'KYC · Emma', parentId: 'v' },
        { id: 'cv', title: 'Carla VIP', parentId: null },
        { id: 'kc', title: 'KYC · Carla', parentId: 'cv' },
      ],
      withCarla,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-carla', ['cv', 'kc']],
      ['c-emma', ['k', 'v']],
    ])
  })

  it('page média à n’importe quelle profondeur sous un script (Script Lucie KYC › Photos › Photo Lucie 1) : jamais un script', () => {
    const r = organize(
      [
        { id: 'k', title: 'Script Lucie KYC', parentId: null },
        { id: 'ph', title: 'Photos', parentId: 'k' },
        { id: 'm', title: 'Photo Lucie 1', parentId: 'ph' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-lucie', ['k']]])
  })

  it('deux mentions distinctes (« Julie et Julie (privé) ») → pas de présélection', () => {
    const r = organize([{ id: 'a', title: 'Script Julie et Julie (privé)', parentId: null }], creators)
    expect(r.recognized).toEqual([])
  })

  it('page parente non partagée → « Sans dossier » ; titre vide → « Sans titre »', () => {
    const r = organize([{ id: 'x', title: '', parentId: 'inconnue' }], creators)
    expect(r.others).toEqual([{ id: 'parent:', title: 'Sans dossier', creatorId: null, scripts: [{ id: 'x', title: 'Sans titre' }] }])
  })

  it('une page « Prompt … » n’est jamais un script, même si elle nomme une modèle ou vit dans son dossier', () => {
    const r = organize([
      { id: 'f-emma', title: 'EMMA', parentId: null },
      { id: 'p1', title: 'Prompt négo Emma', parentId: null },
      { id: 'p2', title: 'Prompt – Script de vente V3', parentId: 'f-emma' },
      { id: 's1', title: 'Script de vente · Emma', parentId: null },
    ])
    expect(r.recognized.flatMap((g) => g.scripts.map((x) => x.id))).toEqual(['s1'])
    // Ni dans « Autres pages » : un prompt ne s'importe jamais, même choisi à la main.
    expect(r.others.flatMap((g) => g.scripts.map((x) => x.id)).sort()).toEqual(['f-emma'])
  })

  it('sous la page d’un prompt : jamais présélectionné, sauf « · Prénom » explicite', () => {
    const r = organize([
      { id: 'p1', title: 'Prompt – Script découverte (KYC)', parentId: null },
      { id: 'x1', title: 'Exemple KYC Emma', parentId: 'p1' },
      { id: 'x2', title: 'Script découverte (KYC) · Lucie', parentId: 'p1' },
    ])
    expect(r.recognized.flatMap((g) => g.scripts.map((x) => x.id))).toEqual(['x2'])
  })
})
