import { describe, it, expect } from 'vitest'
import {
  buildQuotaInsights,
  type QuotaInsightsInput,
  type QuotaTargets,
} from './quotas-hebdo'

const CARLA = 'c-carla'
const LOLA = 'c-lola'
const JASUN = 'ch-jasun'

const TARGETS: Record<string, QuotaTargets> = {
  [CARLA]: { presenceH: 7, reactiviteS: 300, mediasProposes: 10, convPct: 25, caEur: 286 },
  [LOLA]: { presenceH: 7, reactiviteS: 300, mediasProposes: 10, convPct: 25, caEur: 80 },
}

/** Jour actif « parfait » : tous les quotas globaux au vert (cibles Carla). */
const goodDay = (date: string, ca: number) => ({
  chatterId: JASUN,
  date,
  ca,
  propose: 12,
  vendu: 4, // conv 33 % ≥ 25
  presenceActiveH: 8, // ≥ 7
  presenceIdleH: 0.5,
  reactiviteSec: 250, // ≤ 300
})

const baseInput = (over: Partial<QuotaInsightsInput> = {}): QuotaInsightsInput => ({
  evaluated: {
    start: '2026-06-30',
    label: 'sem. 30/06–06/07',
    daysWithData: 7,
    days: [],
    modelDays: [],
    ...over.evaluated,
  },
  currentWeek: null,
  chatterNames: { [JASUN]: 'Jasun' },
  modelNames: { [CARLA]: 'Carla', [LOLA]: 'Lola' },
  targetsByModel: TARGETS,
  ...over,
})

describe('buildQuotaInsights', () => {
  it('prorata 2 modèles : attendu = Σ jours×cible par modèle, split correct, quota CA manqué', () => {
    // 3 j sur Carla (cible 286/j) + 2 j sur Lola (cible 80/j) → attendu 1018 €, réel 600 €.
    const days = ['2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'].map(
      (d) => goodDay(d, 120),
    )
    const modelDays = [
      { chatterId: JASUN, creatorId: CARLA, date: '2026-06-30', ca: 150 },
      { chatterId: JASUN, creatorId: CARLA, date: '2026-07-01', ca: 150 },
      { chatterId: JASUN, creatorId: CARLA, date: '2026-07-02', ca: 100 },
      { chatterId: JASUN, creatorId: LOLA, date: '2026-07-03', ca: 100 },
      { chatterId: JASUN, creatorId: LOLA, date: '2026-07-04', ca: 100 },
    ]
    const card = buildQuotaInsights(
      baseInput({
        evaluated: { start: '2026-06-30', label: 'sem. 30/06–06/07', daysWithData: 7, days, modelDays },
      }),
    )[0]!
    expect(card).toBeDefined()
    const caKpi = card.kpis.find((k) => k.label === 'CA')
    expect(caKpi?.ok).toBe(false)
    expect(caKpi?.target).toContain('1 018') // séparateur de milliers fr-FR (espace fine insécable)
    const carla = card.models.find((m) => m.name === 'Carla')
    const lola = card.models.find((m) => m.name === 'Lola')
    expect(carla).toMatchObject({ days: 3, ca: 400, expected: 858 })
    expect(lola).toMatchObject({ days: 2, ca: 200, expected: 160 })
    expect(carla?.dailies).toEqual([
      { date: '2026-06-30', ca: 150 },
      { date: '2026-07-01', ca: 150 },
      { date: '2026-07-02', ca: 100 },
    ])
  })

  it('tous quotas atteints → carte « saine » (severity ok)', () => {
    const days = ['2026-06-30', '2026-07-01'].map((d) => goodDay(d, 300))
    const modelDays = days.map((d) => ({
      chatterId: JASUN,
      creatorId: CARLA,
      date: d.date,
      ca: 300, // ≥ 286/j
    }))
    const card = buildQuotaInsights(
      baseInput({
        evaluated: { start: '2026-06-30', label: 'sem.', daysWithData: 7, days, modelDays },
      }),
    )[0]!
    expect(card.severity).toBe('ok')
    expect(card.title).toContain('tous les quotas atteints')
    expect(card.actionPlan).toBe('')
  })

  it('3 quotas manqués → critical ; 1 manqué → warning', () => {
    // présence 4h (<7), médias 3 (<10), CA 10 € (<286) manqués ; conv 40 % ok ; réactivité 250 ok.
    const badDay = {
      chatterId: JASUN,
      date: '2026-06-30',
      ca: 10,
      propose: 3,
      vendu: 2,
      presenceActiveH: 4,
      presenceIdleH: 2,
      reactiviteSec: 250,
    }
    const modelDays = [{ chatterId: JASUN, creatorId: CARLA, date: '2026-06-30', ca: 10 }]
    const critical = buildQuotaInsights(
      baseInput({
        evaluated: { start: '2026-06-30', label: 'sem.', daysWithData: 7, days: [badDay], modelDays },
      }),
    )[0]!
    expect(critical.severity).toBe('critical')
    expect(critical.title).toContain('3/5 quotas manqués')

    // Un seul manqué (CA) → warning.
    const warning = buildQuotaInsights(
      baseInput({
        evaluated: {
          start: '2026-06-30',
          label: 'sem.',
          daysWithData: 7,
          days: [goodDay('2026-06-30', 10)],
          modelDays,
        },
      }),
    )[0]!
    expect(warning.severity).toBe('warning')
    expect(warning.title).toContain('1/5 quotas manqués')
  })

  it('clé stable quotas_<weekStart>_<chatterId>', () => {
    const modelDays = [{ chatterId: JASUN, creatorId: CARLA, date: '2026-06-30', ca: 10 }]
    const card = buildQuotaInsights(
      baseInput({
        evaluated: {
          start: '2026-06-30',
          label: 'sem.',
          daysWithData: 7,
          days: [goodDay('2026-06-30', 10)],
          modelDays,
        },
      }),
    )[0]!
    expect(card.key).toBe(`quotas_2026-06-30_${JASUN}`)
  })

  it('réactivité : lower-is-better (350s vs cible 300 → manqué)', () => {
    const day = { ...goodDay('2026-06-30', 10), reactiviteSec: 350 }
    const modelDays = [{ chatterId: JASUN, creatorId: CARLA, date: '2026-06-30', ca: 10 }]
    const card = buildQuotaInsights(
      baseInput({
        evaluated: { start: '2026-06-30', label: 'sem.', daysWithData: 7, days: [day], modelDays },
      }),
    )[0]!
    expect(card.kpis.find((k) => k.label === 'Réactivité')?.ok).toBe(false)
    expect(card.title).toContain('2/5')
  })

  it('semaine partielle : titre suffixé « n j de données »', () => {
    const modelDays = [{ chatterId: JASUN, creatorId: CARLA, date: '2026-06-30', ca: 10 }]
    const card = buildQuotaInsights(
      baseInput({
        evaluated: {
          start: '2026-06-30',
          label: 'sem.',
          daysWithData: 4,
          days: [goodDay('2026-06-30', 10)],
          modelDays,
        },
      }),
    )[0]!
    expect(card.title).toContain('4 j de données')
  })

  it('semaine en cours en difficulté (moy/j < 80 % de S-1) → mentionnée dans body et plan', () => {
    const days = [goodDay('2026-06-30', 10)]
    const modelDays = [{ chatterId: JASUN, creatorId: CARLA, date: '2026-06-30', ca: 100 }]
    const card = buildQuotaInsights(
      baseInput({
        evaluated: { start: '2026-06-30', label: 'sem.', daysWithData: 7, days, modelDays },
        currentWeek: {
          start: '2026-07-07',
          label: 'sem. 07/07–13/07',
          daysWithData: 2,
          days: [{ ...goodDay('2026-07-07', 5) }],
          modelDays: [{ chatterId: JASUN, creatorId: CARLA, date: '2026-07-07', ca: 5 }],
        },
      }),
    )[0]!
    expect(card.body).toContain('En difficulté')
    expect(card.actionPlan).toContain('[SEMAINE EN COURS]')
  })
})
