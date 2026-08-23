import { describe, expect, it } from 'vitest'
import { comboOf, LEVEL_XP, xpGain, xpLevelOf, nextObjective, nextRank, RANKS, rankOf, rankTier, xpOf } from './levels'

describe('xpOf (formule GLA : Σ meilleures notes + boss × 2)', () => {
  it('vaut les points seuls sans boss', () => {
    expect(xpOf({ points: 1240, bossBest: null })).toBe(1240)
    expect(xpOf({ points: 0, bossBest: undefined })).toBe(0)
  })
  it('compte le boss double', () => {
    expect(xpOf({ points: 1240, bossBest: 80 })).toBe(1400)
  })
})

describe('xpLevelOf (palier fixe de 500)', () => {
  it('démarre au niveau 1 à 0 XP', () => {
    expect(xpLevelOf(0)).toEqual({ xp: 0, level: 1, inLevel: 0, need: LEVEL_XP, pct: 0 })
  })
  it('monte d’un niveau tous les 500 XP', () => {
    expect(xpLevelOf(499).level).toBe(1)
    expect(xpLevelOf(500).level).toBe(2)
    expect(xpLevelOf(3240).level).toBe(7)
  })
  it('donne l’avancement DANS le niveau', () => {
    expect(xpLevelOf(3240)).toEqual({ xp: 3240, level: 7, inLevel: 240, need: 500, pct: 48 })
  })
  it('ne casse pas sur une entrée aberrante', () => {
    expect(xpLevelOf(-10)).toEqual({ xp: 0, level: 1, inLevel: 0, need: LEVEL_XP, pct: 0 })
  })
})

describe('rankOf / rankTier / nextRank (sur la moyenne, pas l’XP)', () => {
  it('classe sur les seuils GLA', () => {
    expect(rankOf(null).name).toBe('Recrue')
    expect(rankOf(20).name).toBe('Recrue')
    expect(rankOf(50).name).toBe('Débutant')
    expect(rankOf(65).name).toBe('Confirmé')
    expect(rankOf(75).name).toBe('Closer')
    expect(rankOf(85).name).toBe('Closer d’élite')
    expect(rankOf(100).name).toBe('Closer d’élite')
  })
  it('donne un palier croissant, 0 sans moyenne', () => {
    expect(rankTier(null)).toBe(0)
    expect(rankTier(49)).toBe(0)
    expect(rankTier(85)).toBe(RANKS.length - 1)
  })
  it('annonce le rang suivant et l’écart en points', () => {
    expect(nextRank(62)).toEqual({ rank: RANKS[2], gap: 3 })
    expect(nextRank(85)).toBeNull()
    expect(nextRank(null)).toBeNull()
  })
})

describe('nextObjective (cascade GLA)', () => {
  const mod = (code: string, done: number, total: number) => ({ code, title: `Module ${code}`, emoji: '🧲', done, total })

  it('pousse le premier module incomplet', () => {
    const o = nextObjective({ modules: [mod('a', 3, 3), mod('b', 2, 10)], bossDone: false, bossUnlocked: true, notGoldCount: 4 })
    expect(o).toMatchObject({ kind: 'module', moduleCode: 'b', cta: 'Continuer' })
    expect(o.text).toContain('reste 8 cas')
  })
  it('ignore un module vide', () => {
    const o = nextObjective({ modules: [mod('vide', 0, 0), mod('b', 0, 5)], bossDone: false, bossUnlocked: true, notGoldCount: 0 })
    expect(o.moduleCode).toBe('b')
  })
  it('envoie au boss quand tout est bouclé et le boss débloqué', () => {
    const o = nextObjective({ modules: [mod('a', 3, 3)], bossDone: false, bossUnlocked: true, notGoldCount: 0 })
    expect(o).toMatchObject({ kind: 'boss', cta: 'Boss final' })
  })
  it('vise l’or quand le boss est verrouillé (améliorer les notes le débloque)', () => {
    const o = nextObjective({ modules: [mod('a', 3, 3)], bossDone: false, bossUnlocked: false, notGoldCount: 2 })
    expect(o).toMatchObject({ kind: 'gold' })
    expect(o.text).toContain('2 à améliorer')
  })
  it('sacre celui qui a tout en or', () => {
    const o = nextObjective({ modules: [mod('a', 3, 3)], bossDone: true, bossUnlocked: true, notGoldCount: 0 })
    expect(o).toMatchObject({ kind: 'done', cta: null })
  })
  it('rend un objectif même sans catalogue', () => {
    expect(nextObjective({ modules: [], bossDone: false, bossUnlocked: false, notGoldCount: 0 }).kind).toBe('done')
  })
})

describe('xpGain (une session ne rapporte que ce qu’elle ajoute au record)', () => {
  it('rapporte tout le total la première fois', () => {
    expect(xpGain({ total: 82, previousBest: null, isBoss: false })).toBe(82)
  })
  it('ne rapporte que le delta quand le record est battu', () => {
    expect(xpGain({ total: 92, previousBest: 80, isBoss: false })).toBe(12)
  })
  it('ne rapporte rien quand le record n’est pas battu', () => {
    expect(xpGain({ total: 74, previousBest: 80, isBoss: false })).toBe(0)
    expect(xpGain({ total: 80, previousBest: 80, isBoss: false })).toBe(0)
  })
  it('compte le boss double, comme xpOf', () => {
    expect(xpGain({ total: 90, previousBest: 70, isBoss: true })).toBe(40)
  })
  it('rend 0 sur une session non notée', () => {
    expect(xpGain({ total: null, previousBest: 50, isBoss: false })).toBe(0)
  })
})

describe('comboOf (réussites d’affilée, du plus récent au plus ancien)', () => {
  it('compte jusqu’au premier échec', () => {
    expect(comboOf([true, true, true, false, true])).toBe(3)
  })
  it('vaut 0 si le dernier cas est raté', () => {
    expect(comboOf([false, true, true])).toBe(0)
  })
  it('vaut 0 sans historique', () => {
    expect(comboOf([])).toBe(0)
  })
})
