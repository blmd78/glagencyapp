import { endOfMonth, startOfWeek, format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import { round1, round2, eur, num } from '@/lib/format'
import type { HealthChatter, HealthData, Kpi, LtvStatus, ModelHealth } from '../types'

/** Cible LTV (€ / nouvel abonné) et seuils de statut — hérités de l'ancien dashboard. */
const LTV_TARGET = 10
const LTV_MOYEN = 7

const statusOf = (ltv: number | null): LtvStatus | null =>
  ltv === null ? null : ltv >= LTV_TARGET ? 'sain' : ltv >= LTV_MOYEN ? 'moyen' : 'critique'

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

  const [{ data: creators }, { data: cd }, { data: ccd }, { data: chatters }] = await Promise.all([
    supabase.from('creators').select('id, name, is_private, excluded'),
    supabase
      .from('creator_daily')
      .select('creator_id, date, ca, new_subs, renew_subs')
      .gte('date', period.from)
      .lte('date', period.to),
    supabase
      .from('chatter_creator_daily')
      .select('creator_id, chatter_id, ca')
      .gte('date', period.from)
      .lte('date', period.to),
    supabase.from('chatters').select('id, display_name'),
  ])

  const rows = cd ?? []
  const weekFrom = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  // Agrégats par modèle : période, dernier jour, semaine en cours.
  interface Acc {
    ca: number
    newSubs: number
    renewSubs: number
    weekCa: number
    weekSubs: number
  }
  const agg = new Map<string, Acc>()
  for (const r of rows) {
    const a =
      agg.get(r.creator_id) ?? { ca: 0, newSubs: 0, renewSubs: 0, weekCa: 0, weekSubs: 0 }
    a.ca += r.ca ?? 0
    a.newSubs += r.new_subs ?? 0
    a.renewSubs += r.renew_subs ?? 0
    if (r.date >= weekFrom) {
      a.weekCa += r.ca ?? 0
      a.weekSubs += r.new_subs ?? 0
    }
    agg.set(r.creator_id, a)
  }

  // Chatteurs par modèle (ventilation transactions).
  const chName = new Map((chatters ?? []).map((c) => [c.id, c.display_name ?? '—']))
  const byModel = new Map<string, Map<string, { ca: number }>>()
  for (const r of ccd ?? []) {
    let m = byModel.get(r.creator_id)
    if (!m) {
      m = new Map()
      byModel.set(r.creator_id, m)
    }
    const c = m.get(r.chatter_id) ?? { ca: 0 }
    c.ca += r.ca ?? 0
    m.set(r.chatter_id, c)
  }

  const ltvOf = (ca: number, subs: number) => (subs > 0 ? round2(ca / subs) : null)

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
  const today = new Date()
  const todayIso = format(today, 'yyyy-MM-dd')
  const remainingDays = Math.max(0, endOfMonth(today).getDate() - today.getDate())
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
  const measuredDays = new Set(rows.map((r) => r.date)).size

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
