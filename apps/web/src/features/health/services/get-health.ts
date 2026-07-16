import { daysBetween, endOfMonth, isoDate, mondayOf } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import { round1, round2, eur, num, ltvOf } from '@/lib/format'
import type { HealthChatter, HealthData, Kpi, LtvStatus, ModelHealth } from '../types'

/** Cible LTV (€ / nouvel abonné) et seuils de statut — hérités de l'ancien dashboard. */
const LTV_TARGET = 10
const LTV_MOYEN = 7

const statusOf = (ltv: number | null): LtvStatus | null =>
  ltv === null ? null : ltv >= LTV_TARGET ? 'sain' : ltv >= LTV_MOYEN ? 'moyen' : 'critique'

/** Forme brute renvoyée par le RPC `health_report` (migration 0049) — sommes déjà agrégées EN BASE. */
interface HealthReport {
  /** Agrégat par modèle depuis creator_daily (RLS = ses modèles pour un `user`). */
  by_creator: Array<{
    creator_id: string
    ca: number | null
    new_subs: number | null
    renew_subs: number | null
    week_ca: number | null
    week_subs: number | null
  }>
  /** Ventilation par (modèle, chatteur) depuis chatter_creator_daily. */
  by_pair: Array<{ creator_id: string; chatter_id: string; ca: number | null }>
  /** Jours distincts ingérés sur la période. */
  measured_days: number
}

/**
 * État de santé agrégé sur la période (datepicker) — tracker d'objectif LTV.
 * Sources : `creator_daily` (CA/abonnés par jour) + `chatter_creator_daily` (chatteurs
 * par modèle) + `creators`/`chatters`. LTV = Σca/Σnew_subs ; « dernier jour » = dernière
 * date ingérée de la période (nos données arrivent chaque nuit à 23h49) ; « semaine » =
 * semaine calendaire en cours (lundi) ∩ période. Plan de rattrapage :
 * manque = cible × Σnew_subs − Σca, étalé sur les jours restants du mois.
 */
export async function getHealth(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<HealthData> {
  // Rôle `user` : la RLS limite creator_daily à SES modèles — les chiffres restent justes
  // mais le périmètre n'est plus « l'agence » → l'UI ré-étiquette (cf. HealthTemplate).
  const restricted = opts.restricted ?? false
  const supabase = await createClient()

  // Lundi de la semaine courante : passé au RPC pour que la borne « semaine en cours »
  // soit IDENTIQUE au calcul d'origine (indépendante du fuseau horaire de la base).
  const weekFrom = mondayOf(isoDate(new Date()))

  const [{ data: creators }, { data: chatters }, rpcRes] = await Promise.all([
    supabase.from('creators').select('id, name, is_private, excluded'),
    supabase.from('chatters').select('id, display_name'),
    // Agrégation EN BASE (migration 0049 health_report, SECURITY INVOKER = RLS appliquée) :
    // GROUP BY par modèle + par (modèle, chatteur) fait en Postgres → plus de fetchAll de
    // milliers de lignes journalières ni de reduce JS. Non typé (Functions vide) → cast,
    // comme chatters_report.
    supabase.rpc('health_report' as never, {
      p_from: period.from,
      p_to: period.to,
      p_week_from: weekFrom,
    } as never) as unknown as PromiseLike<{ data: HealthReport | null; error: { message: string } | null }>,
  ])
  if (rpcRes.error) throw new Error(rpcRes.error.message)
  const rep = rpcRes.data ?? { by_creator: [], by_pair: [], measured_days: 0 }

  // Agrégats par modèle (période + semaine en cours) — déjà sommés par le RPC.
  interface Acc {
    ca: number
    newSubs: number
    renewSubs: number
    weekCa: number
    weekSubs: number
  }
  const agg = new Map<string, Acc>()
  for (const r of rep.by_creator) {
    agg.set(r.creator_id, {
      ca: Number(r.ca) || 0,
      newSubs: Number(r.new_subs) || 0,
      renewSubs: Number(r.renew_subs) || 0,
      weekCa: Number(r.week_ca) || 0,
      weekSubs: Number(r.week_subs) || 0,
    })
  }

  // Chatteurs par modèle (ventilation transactions).
  const chName = new Map((chatters ?? []).map((c) => [c.id, c.display_name ?? '—']))
  const byModel = new Map<string, Map<string, { ca: number }>>()
  for (const r of rep.by_pair) {
    let m = byModel.get(r.creator_id)
    if (!m) {
      m = new Map()
      byModel.set(r.creator_id, m)
    }
    const c = m.get(r.chatter_id) ?? { ca: 0 }
    c.ca += Number(r.ca) || 0
    m.set(r.chatter_id, c)
  }


  const totalCa = [...agg.values()].reduce((s, a) => s + a.ca, 0)
  const allModels: ModelHealth[] = (creators ?? [])
    .flatMap((c) => {
      const a = agg.get(c.id)
      if (!a || (a.ca <= 0 && a.newSubs <= 0)) return []
      const ltv = ltvOf(a.ca, a.newSubs)
      const chattersArr: HealthChatter[] = [...(byModel.get(c.id) ?? new Map()).entries()]
        .map(([id, x]) => ({ name: chName.get(id) ?? '—', ca: round2(x.ca) }))
        .filter((x) => x.ca > 0)
        .sort((p, q) => q.ca - p.ca)
      return [
        {
          id: c.id,
          name: c.name,
          isPrivate: c.is_private,
          ltv,
          status: statusOf(ltv),
          ca: round2(a.ca),
          newSubs: a.newSubs,
          renewSubs: a.renewSubs,
          part: totalCa > 0 ? round1((a.ca / totalCa) * 100) : 0,
          weekLtv: ltvOf(a.weekCa, a.weekSubs),
          missingToTarget: Math.max(0, round2(LTV_TARGET * a.newSubs - a.ca)),
          chatters: chattersArr,
        },
      ]
    })
    .sort((a, b) => b.ca - a.ca)

  // Split inclus / exclus (creators.excluded, éditable page Quotas) : les exclus sortent
  // du calcul LTV mais restent affichés à part quand ils ont des données sur la période
  // (le flatMap ci-dessus a déjà écarté les comptes sans CA ni nouveau sub).
  const excludedIds = new Set((creators ?? []).filter((c) => c.excluded).map((c) => c.id))
  const models = allModels.filter((m) => !excludedIds.has(m.id))
  const excludedModels = allModels.filter((m) => excludedIds.has(m.id))

  // Agence : jauge + plan de rattrapage (manque étalé sur les jours restants du mois).
  // La LTV globale se calcule sur les comptes INCLUS uniquement (creators.excluded,
  // éditable page Quotas) — numérateur ET dénominateur, sinon exclure un compte
  // gonflerait artificiellement la jauge. Le KPI « CA total » reste sur TOUS les comptes.
  const includedCa = models.reduce((s, m) => s + m.ca, 0)
  const totalNew = models.reduce((s, m) => s + m.newSubs, 0)
  // Compteur TOUS comptes (symétrique de totalCa) — pour le KPI « Nouveaux abonnés »,
  // qui doit tout compter (seuls jauge et plan LTV se limitent aux inclus).
  const allNew = [...agg.values()].reduce((s, a) => s + a.newSubs, 0)
  const ltv = ltvOf(includedCa, totalNew)
  const todayIso = isoDate(new Date())
  const remainingDays = Math.max(0, daysBetween(todayIso, endOfMonth(todayIso)))
  const missing = Math.max(0, round2(LTV_TARGET * totalNew - includedCa))
  // Un plan de rattrapage n'a de sens que si la période inclut AUJOURD'HUI (sur un mois
  // clos, il n'y a rien à rattraper) ; le dernier jour du mois, il reste la journée en cours.
  const periodIsLive = period.from <= todayIso && todayIso <= period.to
  const planDays = Math.max(1, remainingDays)
  const plan =
    ltv !== null && missing > 0 && periodIsLive
      ? {
          missing,
          perDay: Math.ceil(missing / planDays),
          remainingDays: planDays,
          objective: round2(LTV_TARGET * totalNew),
          realized: round2(includedCa),
          subs: totalNew,
        }
      : null

  // Modèles sous la cible LTV (ceux sans nouveau sub — LTV incalculable — non comptés).
  const rated = models.filter((m) => m.ltv !== null)
  const below = rated.filter((m) => (m.ltv ?? 0) < LTV_TARGET)
  const worst = below.length
    ? below.reduce((a, b) => ((a.ltv ?? 0) <= (b.ltv ?? 0) ? a : b))
    : null
  const measuredDays = rep.measured_days

  const kpis: Kpi[] = [
    {
      key: 'ca',
      label: 'CA total',
      value: eur(totalCa),
      deltaPct: null,
      trendLabel: 'Total période',
      hint: period.label,
    },
    {
      key: 'new',
      label: 'Nouveaux abonnés',
      value: num(allNew),
      deltaPct: null,
      trendLabel: 'Premier abo all-time du fan',
      hint: restricted ? 'tes modèles' : 'tous modèles',
    },
    {
      key: 'below',
      label: 'Modèles sous la cible',
      value: `${below.length} / ${rated.length}`,
      deltaPct: null,
      trendLabel: worst
        ? `Le plus bas : ${worst.name} (${worst.ltv!.toLocaleString('fr-FR')} €)`
        : 'Tous les modèles sont au-dessus',
      hint: `LTV < ${LTV_TARGET} € / nouvel abonné`,
    },
    {
      key: 'days',
      label: 'Jours restants (mois)',
      value: `${remainingDays} j`,
      deltaPct: null,
      trendLabel: `${measuredDays} jour(s) ingérés sur la période`,
      hint: period.label,
    },
  ]

  return {
    periodLabel: period.label,
    restricted,
    target: LTV_TARGET,
    ltv,
    status: statusOf(ltv),
    kpis,
    plan,
    models,
    excludedModels,
  }
}
