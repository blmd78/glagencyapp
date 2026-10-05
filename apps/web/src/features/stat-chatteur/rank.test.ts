import { describe, it, expect } from 'vitest'
import { rankByModel, rankChatters, type RankableChatter } from './rank'

const chatter = (over: Partial<RankableChatter>): RankableChatter => ({
  id: 'c',
  name: 'Chatter',
  ca: 0,
  isChatter: true,
  models: [],
  ...over,
})

const data: RankableChatter[] = [
  chatter({
    id: 'ana',
    name: 'Ana',
    ca: 900,
    models: [
      { creatorId: 'carla', model: 'Carla', ca: 600 },
      { creatorId: 'julie', model: 'Julie', ca: 300 },
    ],
  }),
  chatter({ id: 'bea', name: 'Béa', ca: 700, models: [{ creatorId: 'carla', model: 'Carla', ca: 700 }] }),
  chatter({ id: 'cle', name: 'Clé', ca: 50, models: [{ creatorId: 'julie', model: 'Julie', ca: 50 }] }),
  // Fiche MyPuls d'un manager : jamais classée, ni au global ni par modèle.
  chatter({ id: 'mgr', name: 'Remi manager', ca: 5000, isChatter: false, models: [{ creatorId: 'carla', model: 'Carla', ca: 5000 }] }),
  chatter({ id: 'zero', name: 'Zéro', ca: 0, models: [{ creatorId: 'carla', model: 'Carla', ca: 0 }] }),
]

describe('rankChatters', () => {
  it('classe les chatteurs à CA positif, du plus haut au plus bas, sans les fiches non chatteur', () => {
    expect(rankChatters(data)).toEqual([
      { id: 'ana', name: 'Ana', ca: 900, rank: 1 },
      { id: 'bea', name: 'Béa', ca: 700, rank: 2 },
      { id: 'cle', name: 'Clé', ca: 50, rank: 3 },
    ])
  })
})

describe('rankByModel', () => {
  it('un classement par modèle, sur le seul CA fait sur elle ; les modèles de la plus rentable à la moins rentable', () => {
    const byModel = rankByModel(data)
    expect(byModel.map((m) => [m.creatorId, m.model, m.total])).toEqual([
      ['carla', 'Carla', 1300],
      ['julie', 'Julie', 350],
    ])
    expect(byModel[0]!.rows).toEqual([
      { id: 'bea', name: 'Béa', ca: 700, rank: 1 },
      { id: 'ana', name: 'Ana', ca: 600, rank: 2 },
    ])
    expect(byModel[1]!.rows.map((r) => r.id)).toEqual(['ana', 'cle'])
  })

  it('deux comptes d’une même modèle restent deux entrées', () => {
    const byModel = rankByModel([
      chatter({
        id: 'ana',
        name: 'Ana',
        ca: 30,
        models: [
          { creatorId: 'carla', model: 'Carla', ca: 10 },
          { creatorId: 'carla-prive', model: 'Carla (privé)', ca: 20 },
        ],
      }),
    ])
    expect(byModel.map((m) => m.model)).toEqual(['Carla (privé)', 'Carla'])
  })
})
