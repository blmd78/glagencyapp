/**
 * Règle « Quotas hebdo » — reprise des Analyses du CRM legacy, corrigée du biais
 * de changement de modèle : UNE carte par chatteur, évaluée sur la semaine S-1
 * (ou la semaine courante partielle à l'amorçage), avec le quota CA calculé au
 * PRORATA exact des jours travaillés sur chaque modèle (cible CA/j du modèle).
 * Les 4 autres quotas (présence, réactivité, médias, conversion) n'existent qu'au
 * grain chatteur global (MyPuls ne les ventile pas) — cibles du modèle dominant.
 * Vocabulaire UX : « quotas manqués » (pas de jargon).
 */

export interface QuotaTargets {
  presenceH: number
  reactiviteS: number
  mediasProposes: number
  convPct: number
  caEur: number
}

export interface ChatterDayInput {
  chatterId: string
  date: string
  ca: number
  propose: number
  vendu: number
  presenceActiveH: number
  presenceIdleH: number
  reactiviteSec: number | null
}

export interface ChatterModelDayInput {
  chatterId: string
  creatorId: string
  date: string
  ca: number
}

export interface WeekWindow {
  /** Lundi (YYYY-MM-DD). */
  start: string
  /** Libellé humain, ex. « sem. 30/06–06/07 ». */
  label: string
  /** Jours de données disponibles dans la fenêtre (≤ 7 ; < 7 = semaine partielle). */
  daysWithData: number
  days: ChatterDayInput[]
  modelDays: ChatterModelDayInput[]
}

export interface QuotaInsightsInput {
  /** Fenêtre évaluée (S-1, ou semaine courante partielle à l'amorçage). */
  evaluated: WeekWindow
  /** Semaine courante (suivi) — null quand `evaluated` EST la semaine courante. */
  currentWeek: WeekWindow | null
  chatterNames: Record<string, string>
  modelNames: Record<string, string>
  /** creatorId → quotas de son équipe (absent = quotas non configurés). */
  targetsByModel: Record<string, QuotaTargets>
}

export interface InsightKpi {
  label: string
  value: string
  target: string
  ok: boolean
}

export interface DailyCa {
  date: string
  ca: number
}

export interface InsightModelSplit {
  name: string
  days: number
  ca: number
  expected: number
  /** % d'atteinte du CA attendu (100 si rien d'attendu). */
  pct: number
  weekDays: number
  weekCa: number
  weekExpected: number
  /** Détail jour par jour (S-1) — pour le survol « détail » de l'UI. */
  dailies: DailyCa[]
  /** Détail jour par jour (semaine en cours). */
  weekDailies: DailyCa[]
}

export interface InsightDraft {
  key: string
  weekStart: string
  severity: 'critical' | 'warning' | 'ok'
  chatterId: string
  title: string
  body: string
  actionPlan: string
  kpis: InsightKpi[]
  models: InsightModelSplit[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`

/** Niveau gamification hérité du legacy (mois-équivalent = CA moy/j × 30). */
export function levelOf(caPerDay: number): string {
  const monthlyEq = caPerDay * 30
  if (monthlyEq > 4000) return 'Commandant'
  if (monthlyEq >= 1900) return 'Stratège'
  if (monthlyEq >= 1000) return 'Recrue'
  return 'Gobelin'
}

interface ChatterAgg {
  activeDays: string[]
  ca: number
  propose: number
  vendu: number
  presence: number
  idle: number
  reacts: number[]
  /** creatorId → (date → ca du jour) : porte à la fois les jours actifs et le détail. */
  perModel: Map<string, Map<string, number>>
}

function aggregate(win: WeekWindow): Map<string, ChatterAgg> {
  const out = new Map<string, ChatterAgg>()
  const get = (id: string): ChatterAgg => {
    let a = out.get(id)
    if (!a) {
      a = { activeDays: [], ca: 0, propose: 0, vendu: 0, presence: 0, idle: 0, reacts: [], perModel: new Map() }
      out.set(id, a)
    }
    return a
  }
  for (const d of win.days) {
    const a = get(d.chatterId)
    a.activeDays.push(d.date)
    a.ca += d.ca
    a.propose += d.propose
    a.vendu += d.vendu
    a.presence += d.presenceActiveH
    a.idle += d.presenceIdleH
    if (d.reactiviteSec != null) a.reacts.push(d.reactiviteSec)
  }
  for (const m of win.modelDays) {
    if (m.ca <= 0) continue
    const a = get(m.chatterId)
    let pm = a.perModel.get(m.creatorId)
    if (!pm) {
      pm = new Map()
      a.perModel.set(m.creatorId, pm)
    }
    pm.set(m.date, (pm.get(m.date) ?? 0) + m.ca)
  }
  return out
}

const modelCa = (pm: Map<string, number>) => [...pm.values()].reduce((s, x) => s + x, 0)
const dailiesOf = (pm: Map<string, number> | undefined): DailyCa[] =>
  [...(pm ?? new Map<string, number>())]
    .map(([date, ca]) => ({ date, ca: r2(ca) }))
    .sort((a, b) => a.date.localeCompare(b.date))

/** CA attendu au prorata : Σ (jours actifs sur le modèle × cible CA/j du modèle). */
function expectedCa(agg: ChatterAgg, targets: Record<string, QuotaTargets>): number {
  let total = 0
  for (const [creatorId, pm] of agg.perModel) {
    const t = targets[creatorId]
    if (t) total += pm.size * t.caEur
  }
  return total
}

/** Cibles des quotas globaux = celles du modèle dominant (max CA sur la fenêtre). */
function dominantTargets(
  agg: ChatterAgg,
  targets: Record<string, QuotaTargets>,
): QuotaTargets | null {
  let best: { ca: number; t: QuotaTargets } | null = null
  for (const [creatorId, pm] of agg.perModel) {
    const t = targets[creatorId]
    const ca = modelCa(pm)
    if (t && (!best || ca > best.ca)) best = { ca, t }
  }
  return best?.t ?? null
}

export function buildQuotaInsights(input: QuotaInsightsInput): InsightDraft[] {
  const { evaluated, currentWeek, chatterNames, modelNames, targetsByModel } = input
  const evalAgg = aggregate(evaluated)
  const weekAgg = currentWeek ? aggregate(currentWeek) : null
  const partial = evaluated.daysWithData < 7

  const drafts: InsightDraft[] = []

  for (const [chatterId, agg] of evalAgg) {
    const days = agg.activeDays.length
    if (days === 0) continue
    const t = dominantTargets(agg, targetsByModel)
    if (!t) continue // aucun modèle avec quotas configurés → rien d'évaluable

    // ── Les 5 quotas (moyennes journalières sur jours actifs, cibles = /jour) ──
    const presenceAvg = agg.presence / days
    const mediasAvg = agg.propose / days
    const conv = agg.propose > 0 ? (agg.vendu / agg.propose) * 100 : null
    const react = agg.reacts.length
      ? agg.reacts.reduce((s, x) => s + x, 0) / agg.reacts.length
      : null
    const expected = expectedCa(agg, targetsByModel)
    const caPerDay = agg.ca / days

    const kpis: InsightKpi[] = [
      {
        label: 'Présence',
        value: `${r1(presenceAvg)}h/j`,
        target: `${t.presenceH}h/j`,
        ok: presenceAvg >= t.presenceH,
      },
      {
        label: 'Réactivité',
        value: react === null ? '—' : `${Math.round(react)}s`,
        target: `≤ ${t.reactiviteS}s`,
        ok: react === null ? true : react <= t.reactiviteS, // lower-is-better
      },
      {
        label: 'Médias prop.',
        value: `${r1(mediasAvg)}/j`,
        target: `${t.mediasProposes}/j`,
        ok: mediasAvg >= t.mediasProposes,
      },
      {
        label: 'Taux conv.',
        value: conv === null ? '—' : `${r1(conv)} %`,
        target: `${t.convPct} %`,
        ok: conv === null ? true : conv >= t.convPct,
      },
      {
        label: 'CA',
        value: eur(agg.ca),
        target: `${eur(expected)} attendus`,
        ok: expected <= 0 ? true : agg.ca >= expected,
      },
    ]

    const missed = kpis.filter((k) => !k.ok).length
    // Tout le monde a sa carte : sain (0 manqué), moyen (1-2), critique (3+).
    const severity: InsightDraft['severity'] =
      missed >= 3 ? 'critical' : missed >= 1 ? 'warning' : 'ok'
    const name = chatterNames[chatterId] ?? '—'

    // ── Split par modèle (S-1 + semaine en cours) ──
    const weekChatter = weekAgg?.get(chatterId)
    const models: InsightModelSplit[] = [...agg.perModel.entries()]
      .map(([creatorId, pm]) => {
        const target = targetsByModel[creatorId]
        const ca = modelCa(pm)
        const exp = target ? pm.size * target.caEur : 0
        const wk = weekChatter?.perModel.get(creatorId)
        const wkCa = wk ? modelCa(wk) : 0
        const wkExp = target && wk ? wk.size * target.caEur : 0
        return {
          name: modelNames[creatorId] ?? '—',
          days: pm.size,
          ca: r2(ca),
          expected: r2(exp),
          pct: exp > 0 ? Math.round((ca / exp) * 100) : 100,
          weekDays: wk?.size ?? 0,
          weekCa: r2(wkCa),
          weekExpected: r2(wkExp),
          dailies: dailiesOf(pm),
          weekDailies: dailiesOf(wk),
        }
      })
      .sort((a, b) => b.ca - a.ca)

    // ── Semaine en cours (suivi global) ──
    let weekLine = ''
    let weekStruggling = false
    if (currentWeek && weekChatter) {
      const wDays = weekChatter.activeDays.length
      const wPerDay = wDays > 0 ? weekChatter.ca / wDays : 0
      weekStruggling = wPerDay < caPerDay * 0.8
      weekLine = `Semaine en cours (${currentWeek.label}) : ${eur(weekChatter.ca)} · ${eur(wPerDay)}/j (j${wDays}/7) — ${
        weekStruggling ? 'En difficulté' : 'Dans la cible'
      }`
    } else if (currentWeek) {
      weekStruggling = true
      weekLine = `Semaine en cours (${currentWeek.label}) : 0 € — aucune activité — En difficulté`
    }

    // ── Body ──
    const level = levelOf(caPerDay)
    const body = [
      `${evaluated.label} : ${eur(agg.ca)} · ${eur(caPerDay)}/j (${days} j actifs) — niveau ${level}.`,
      `Présence : ${r1(presenceAvg)}h/j (cible ${t.presenceH}h/j) · idle ${r1(agg.idle / days)}h/j.`,
      weekLine,
    ]
      .filter(Boolean)
      .join('\n')

    // ── Plan d'action (sections uniquement pour les volets en échec) ──
    const plan: string[] = []
    const caOk = kpis.find((k) => k.label === 'CA')?.ok ?? true
    const presenceOk = kpis.find((k) => k.label === 'Présence')?.ok ?? true
    if (!caOk) {
      plan.push(
        `[CA]\nCA sous l'attendu : ${eur(agg.ca)} pour ${eur(expected)} attendus (prorata modèles).\n- RDV avec ${name} en début de semaine — analyser les causes (présence ? scripts ? fans assignés ?).\n- Objectif minimal cette semaine : ${eur(caPerDay * 1.2)}/j (+20 % vs ${evaluated.label}).\n- Croiser le CA avec le taux de conv. et le nb de médias proposés.\nSi situation récurrente (2ᵉ semaine consécutive) :\n- Convocation bureau + rapport.\n- Plan de redressement sur 2 semaines avec objectifs journaliers.`,
      )
    }
    if (!presenceOk) {
      plan.push(
        `[PRÉSENCE]\nPrésence insuffisante : ${r1(presenceAvg)}h/j pour ${t.presenceH}h/j attendus.\n- Vérifier les temps idle sur MyPuls : max 1h/j toléré (ici ${r1(agg.idle / days)}h/j).\n- Si idle élevé : MyPuls probablement laissé allumé sans travailler — fausse aussi la réactivité.\n- Si présence réelle < cible sur la semaine : convocation bureau + rapport.`,
      )
    }
    if (weekStruggling && weekLine) {
      plan.push(
        `[SEMAINE EN COURS]\n${weekLine}\n- Ne pas attendre vendredi — point AUJOURD'HUI avec ${name}.\n- Objectif de rattrapage immédiat : viser ${eur(caPerDay)}/j minimum.`,
      )
    }

    drafts.push({
      key: `quotas_${evaluated.start}_${chatterId}`,
      weekStart: evaluated.start,
      severity,
      chatterId,
      title: `${name} — S-1 : ${
        missed === 0 ? 'tous les quotas atteints' : `${missed}/5 quotas manqués`
      }${partial ? ` · ${evaluated.daysWithData} j de données` : ''}`,
      body,
      actionPlan: plan.join('\n\n'),
      kpis,
      models,
    })
  }

  // Critiques d'abord, puis moyens, puis sains ; alphabétique à sévérité égale.
  const rank = { critical: 0, warning: 1, ok: 2 } as const
  return drafts.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title),
  )
}
