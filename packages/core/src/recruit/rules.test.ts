import { describe, expect, it } from 'vitest'
import { computeVerdict, gradeQi, pickQiQuestions, type QiSlot, type RecruitConfig } from './rules'

const BANK: QiSlot[] = [
  { slot: 'Suite logique', variants: [
    { q: 'Quelle est la suite : 2, 4, 8, 16, … ?', opts: ['24', '32', '30', '18'], a: 1 },
    { q: 'Quelle est la suite : 3, 6, 9, 12, … ?', opts: ['13', '15', '16', '14'], a: 1 },
  ] },
  { slot: 'Intrus', variants: [
    { q: "Trouve l'intrus :", opts: ['pomme', 'banane', 'carotte', 'cerise'], a: 2 },
    { q: "Trouve l'intrus :", opts: ['lundi', 'mars', 'mercredi', 'vendredi'], a: 1 },
  ] },
]

/** Config de référence des tests (les valeurs seedées par 0125 en base). */
const CONFIG: RecruitConfig = {
  botMessages: 14,
  qiTimer: 30,
  frappeMin: 30,
  connexionMin: 10,
  qiMin: 3,
  globalThreshold: 70,
}

describe('pickQiQuestions', () => {
  it('tire 1 variante par emplacement, sans la bonne réponse', () => {
    const { questions } = pickQiQuestions(BANK, () => 0)
    expect(questions).toEqual([
      { slot: 'Suite logique', q: 'Quelle est la suite : 2, 4, 8, 16, … ?', opts: ['24', '32', '30', '18'] },
      { slot: 'Intrus', q: "Trouve l'intrus :", opts: ['pomme', 'banane', 'carotte', 'cerise'] },
    ])
    // pas de clé « a » dans les questions envoyées au client
    for (const q of questions) expect('a' in q).toBe(false)
  })

  it('appelle rand avec le nombre de variantes du slot', () => {
    const seen: number[] = []
    pickQiQuestions(BANK, (n) => { seen.push(n); return 0 })
    expect(seen).toEqual([2, 2])
  })

  it('la clé de correction correspond à la variante tirée par slot', () => {
    // 1er slot → variante 0 (a=1), 2e slot → variante 1 (a=1)
    let call = 0
    const { answerKey } = pickQiQuestions(BANK, () => (call++ === 0 ? 0 : 1))
    expect(answerKey).toEqual([1, 1])

    // même tirage mais sur la 2e variante du 1er slot (a=1) et la 1ère du 2e slot (a=2)
    call = 0
    const idx = [1, 0]
    const { answerKey: key2, questions } = pickQiQuestions(BANK, () => idx[call++] as number)
    expect(key2).toEqual([1, 2])
    expect(questions[0]?.q).toBe('Quelle est la suite : 3, 6, 9, 12, … ?')
    expect(questions[1]?.q).toBe("Trouve l'intrus :")
    expect(questions[1]?.opts).toEqual(['pomme', 'banane', 'carotte', 'cerise'])
  })
})

describe('gradeQi', () => {
  const key = [1, 2, 0, 3, 1]

  it('compte les réponses correctes', () => {
    expect(gradeQi(key, [1, 2, 0, 3, 1])).toBe(5)
    expect(gradeQi(key, [1, 2, 0, 3, 0])).toBe(4)
    expect(gradeQi(key, [0, 0, 0, 0, 0])).toBe(1)
  })

  it('null/undefined/hors bornes = faux', () => {
    expect(gradeQi(key, [1, null, 0, 3, 1])).toBe(4)
    expect(gradeQi(key, [1, 2, 0, 3])).toBe(4) // undefined implicite (answers plus court) sur la dernière question seulement
    expect(gradeQi(key, [1, 2, 0, 3, 99])).toBe(4) // hors bornes de la clé (pas une valeur d'option valide)
    expect(gradeQi(key, [])).toBe(0)
  })
})

describe('computeVerdict', () => {
  const okBot = { total: 68, orthographe: 20, coherence: 18, relance: 15, vente: 15 }
  const base = { qi: 4, wpm: 40, mbps: 20, bot: okBot, config: CONFIG }

  it('global = round(qi/5*30 + bot.total/100*70) — exemple qi 4, bot 68 → 24 + 47.6 → 72', () => {
    const v = computeVerdict(base)
    expect(v.global).toBe(72)
    expect(v.passed).toBe(true)
    expect(v.refusalStep).toBeNull()
    expect(v.refusalReason).toBeNull()
  })

  it('gate frappe prioritaire sur tout le reste', () => {
    const v = computeVerdict({ ...base, wpm: 29, mbps: 1, qi: 0 })
    expect(v.passed).toBe(false)
    expect(v.refusalStep).toBe('Vitesse de frappe')
    expect(v.refusalReason).toBe('ta vitesse de frappe est en dessous de ce qu\'on recherche pour le poste')
  })

  it('gate connexion (frappe ok) prioritaire sur QI et le global', () => {
    const v = computeVerdict({ ...base, mbps: 9, qi: 0 })
    expect(v.passed).toBe(false)
    expect(v.refusalStep).toBe('Connexion internet')
    expect(v.refusalReason).toBe('ta connexion internet est trop lente pour assurer le chat')
  })

  it('gate QI (frappe + connexion ok) prioritaire sur le global', () => {
    const v = computeVerdict({ ...base, qi: 2 })
    expect(v.passed).toBe(false)
    expect(v.refusalStep).toBe('Test de logique')
    expect(v.refusalReason).toBe("tes réponses au test de logique n'étaient pas assez solides")
  })

  it('passed est exact au seuil (global = 70 passe, 69 refuse)', () => {
    // qi=5 (30) + bot=X/100*70 : viser global exactement 70 puis 69
    const v70 = computeVerdict({ ...base, qi: 5, bot: { ...okBot, total: 57 } }) // 30 + 39.9=69.9→70
    expect(v70.global).toBe(70)
    expect(v70.passed).toBe(true)

    const v69 = computeVerdict({ ...base, qi: 5, bot: { ...okBot, total: 55 } }) // 30 + 38.5=68.5→69 (round half to even? check)
    expect(v69.global).toBe(69)
    expect(v69.passed).toBe(false)
    expect(v69.refusalStep).toBe('Conversation avec le client')
  })

  it('raison qualitative = axe le plus faible du bot, départage orthographe → vente → relance → défaut cohérence', () => {
    const low = (bot: typeof okBot) => computeVerdict({ ...base, qi: 5, bot: { ...bot, total: 10 } })

    expect(low({ total: 0, orthographe: 5, coherence: 20, relance: 20, vente: 20 }).refusalReason)
      .toBe('ta qualité d\'écriture pouvait être plus soignée')

    // égalité orthographe/vente → priorité orthographe
    expect(low({ total: 0, orthographe: 5, coherence: 20, relance: 20, vente: 5 }).refusalReason)
      .toBe('ta qualité d\'écriture pouvait être plus soignée')

    expect(low({ total: 0, orthographe: 20, coherence: 20, relance: 20, vente: 5 }).refusalReason)
      .toBe("tu n'as pas assez su orienter la discussion vers une vente")

    // égalité vente/relance → priorité vente
    expect(low({ total: 0, orthographe: 20, coherence: 20, relance: 5, vente: 5 }).refusalReason)
      .toBe("tu n'as pas assez su orienter la discussion vers une vente")

    expect(low({ total: 0, orthographe: 20, coherence: 20, relance: 5, vente: 20 }).refusalReason)
      .toBe('tu n\'as pas assez relancé pour garder le client accroché')

    // cohérence seule la plus faible → raison par défaut
    expect(low({ total: 0, orthographe: 20, coherence: 5, relance: 20, vente: 20 }).refusalReason)
      .toBe('la conversation manquait de fluidité et de naturel')

    expect(low({ total: 0, orthographe: 20, coherence: 5, relance: 20, vente: 20 }).refusalStep)
      .toBe('Conversation avec le client')
  })
})
