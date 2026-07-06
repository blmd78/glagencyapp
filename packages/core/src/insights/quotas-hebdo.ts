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
  /** id du compte OF (creators.id) — sert au cloisonnement RLS et au groupement par modèle. */
  creatorId: string
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

/** Suivi de la semaine en cours (bloc séparé de l'analyse S-1 dans l'UI). */
export interface WeekTracking {
  label: string
  days: number
  ca: number
  perDay: number
  /** true = rythme < 80 % du CA/j de S-1. */
  struggling: boolean
  /** Évolution du CA/j vs S-1 en % (null si pas de référence exploitable). */
  deltaPct: number | null
}

export interface InsightDraft {
  key: string
  weekStart: string
  severity: 'critical' | 'warning' | 'ok'
  chatterId: string
  title: string
  /** Synthèse S-1 en UNE ligne compacte (pas de prose). */
  body: string
  /** Une section par quota manqué — TOUJOURS aligné sur le nombre de chips rouges. */
  actionPlan: string
  kpis: InsightKpi[]
  models: InsightModelSplit[]
  week: WeekTracking | null
}

import { round1 as r1, round2 as r2 } from '../domain/dates'

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

    // ── Les 5 quotas. Présence = TOTAL hebdo vs 7h × 6 j (méthodo Benoit : 42h/sem
    // obligatoires) ; les autres en moyenne journalière sur jours actifs. ──
    const expectedDays = Math.min(6, evaluated.daysWithData)
    const expectedPresence = t.presenceH * expectedDays
    const idleTolerance = expectedDays * 1 // 1h de pause tolérée par jour
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
        value: `${r1(agg.presence)}h`,
        target: `${r1(expectedPresence)}h (${t.presenceH}h/j × ${expectedDays} j)`,
        ok: agg.presence >= expectedPresence,
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
          creatorId,
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

    // ── Suivi semaine en cours : bloc STRUCTURÉ, séparé de l'analyse S-1 ──
    let week: WeekTracking | null = null
    if (currentWeek) {
      const wDays = weekChatter?.activeDays.length ?? 0
      const wCa = weekChatter?.ca ?? 0
      const wPerDay = wDays > 0 ? wCa / wDays : 0
      week = {
        label: currentWeek.label,
        days: wDays,
        ca: r2(wCa),
        perDay: r2(wPerDay),
        // « En difficulté » seulement si la semaine a démarré (données globales) :
        // un chatteur absent d'une semaine active = en difficulté ; une semaine qui
        // vient de basculer (0 jour ingéré pour tous) = simple attente, pas une alerte.
        struggling:
          currentWeek.daysWithData > 0 && (wDays === 0 || wPerDay < caPerDay * 0.8),
        deltaPct: caPerDay > 0 && wDays > 0 ? Math.round((wPerDay / caPerDay - 1) * 100) : null,
      }
    }

    // ── Synthèse S-1 : UNE ligne compacte, zéro prose ──
    const level = levelOf(caPerDay)
    const body = `${days} j actif${days > 1 ? 's' : ''} · ${eur(agg.ca)} (${eur(caPerDay)}/j) · niveau ${level} · présence ${r1(agg.presence)}h · idle ${r1(agg.idle)}h`

    // ── Plan d'action : UNE section par case rouge, dans l'ordre des chips ──
    const plan: string[] = []
    const ko = (label: string) => kpis.find((k) => k.label === label)?.ok === false
    if (ko('Présence')) {
      plan.push(
        `[PRÉSENCE] ${r1(agg.presence)}h sur ${r1(expectedPresence)}h attendues (${t.presenceH}h/j × ${expectedDays} j).\n- Vérifier l'idle MyPuls : 1h de pause/j tolérée, soit ${idleTolerance}h/semaine — ici ${r1(agg.idle)}h.\n- Idle > ${idleTolerance}h/sem : soit il erre sur son PC sans vraiment travailler, soit MyPuls reste allumé après déconnexion (ça fausse aussi la réactivité et les autres stats).\n- Sous les ${r1(expectedPresence)}h obligatoires : rendez-vous au bureau avec le manager + explication à Axel.`,
      )
    }
    if (ko('Réactivité')) {
      plan.push(
        `[RÉACTIVITÉ] ${react === null ? '—' : Math.round(react) + 's'} de moyenne pour ≤ ${t.reactiviteS}s (5 min).\n- Regarder immédiatement ce qu'il fait : nombre d'assignations — trop de conversations = ingérable, rééquilibrer.\n- Vérifier qu'il se DÉCONNECTE bien de MyPuls en pause et en fin de shift (sinon le temps de réponse gonfle).\n- Vérifier la désassignation de toutes ses conversations en fin de shift.\n- Regarder le délai entre le dernier message et le média envoyé.\n- Analyser en partage d'écran sa vitesse d'écriture — si c'est le problème : exercices de frappe, 2/jour minimum pendant 7 jours, à chaque fin de shift.`,
      )
    }
    if (ko('Médias prop.')) {
      plan.push(
        `[MÉDIAS PROPOSÉS] ${r1(mediasAvg)}/j pour ${t.mediasProposes}/j minimum (médias PAYANTS uniquement).\n- Comparer ses messages envoyés et ses médias proposés aux chiffres d'avant.\n- Vérifier son activité générale dans l'outil d'analyse MyPuls (était-il vraiment actif ?).\n- Sanctions déjà existantes → convocation directe ; sinon message personnel demandant une explication, puis bureau pour présenter le bilan si anomalie.`,
      )
    }
    if (ko('Taux conv.')) {
      plan.push(
        `[CONVERSION] ${conv === null ? '—' : r1(conv) + ' %'} pour ${t.convPct} % minimum.\n- Croiser le taux avec le nombre de médias proposés : peu de médias + taux bas → proposer plus de médias payants ; beaucoup de médias + taux bas → travailler le closing au moment de la vente.\n- Analyser ce qui se passe après l'envoi du média : pourquoi le fan n'achète pas ? (script, temps de réponse).\n- Vérifier les euros reçus : un fan qui paye plus peut justifier une stratégie différente.`,
      )
    }
    if (ko('CA')) {
      plan.push(
        expected > 0 && agg.ca < expected * 0.6
          ? `[CA] Situation critique : ${eur(agg.ca)} réalisés pour ${eur(expected)} attendus (prorata modèles).\n- RDV avec ${name} en début de semaine : analyser les causes (présence ? scripts ? fans assignés ?).\n- Objectif minimal cette semaine : ${eur(caPerDay * 1.2)}/j (+20 % vs S-1).\n- Croiser le CA avec le taux de conv. et le nb de médias proposés.\n- Identifier les fans à fort potentiel non relancés ou mal suivis.\nSi situation récurrente (2ᵉ semaine consécutive) :\n- Convocation bureau + rapport à Axel.\n- Plan de redressement sur 2 semaines avec objectifs journaliers.`
          : `[CA] Recul notable : ${eur(agg.ca)} réalisés pour ${eur(expected)} attendus (prorata modèles).\n- Point individuel en début de semaine avec ${name} — objectif : ${eur(agg.ca * 1.15)} cette semaine (+15 %).\n- Analyser si les fans assignés ont bien été relancés.\n- Vérifier les créneaux horaires : shifts complets et bien couverts.\n- Point de mi-semaine mercredi — ajuster si pas de reprise.`,
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
      week,
    })
  }

  // Critiques d'abord, puis moyens, puis sains ; alphabétique à sévérité égale.
  const rank = { critical: 0, warning: 1, ok: 2 } as const
  return drafts.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title),
  )
}
