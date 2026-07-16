import { addDays, endOfMonth, isoDate, round1, startOfMonth } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import { eur, int } from '@/lib/format'
import type { DailyPoint, Insight, Kpi, ModelCa, ModelSubs, OverviewData } from '../types'

/** Forme brute renvoyée par le RPC `overview_report` (migration 0052) — agrégée EN BASE. */
interface OverviewReport {
  /** Par modèle sur la période (CA + nouveaux abonnés). */
  by_model: Array<{ creator_id: string; ca: number | null; new_subs: number | null }>
  /** CA total par jour sur le(s) mois du graphe. */
  daily: Array<{ date: string; ca: number | null }>
  /** CA par chatteur sur la période (source selon le rôle). */
  by_chatter: Array<{ chatter_id: string; ca: number | null }>
}

/**
 * Overview agrégée sur la période choisie (datepicker du header).
 * Source : `creator_daily` (CA/modèle/abonnés/série) + `chatter_daily` (actifs/com).
 * Tout vient de la DB (ingestion quotidienne) ; insights vides tant que le moteur de
 * règles @glagency/core n'est pas branché.
 *
 * Mode `restricted` (rôle `user`) : `chatter_daily` est admin-only en RLS (retournerait
 * [] SANS erreur → KPIs à 0 mensongers). Les KPIs chatteurs se calculent alors depuis
 * `chatter_creator_daily` (limité par la RLS à SES modèles) et la carte « Sous 200 € de
 * com » disparaît (la com se définit sur le CA TOTAL d'un chatteur, incalculable ici).
 */
export async function getOverview(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<OverviewData> {
  const restricted = opts.restricted ?? false
  const supabase = await createClient()

  // Le graphe CA quotidien couvre toujours le(s) mois entier(s) de la sélection :
  // on élargit la requête `creator_daily`, mais KPIs/classements restent bornés à la période.
  const chartFrom = startOfMonth(period.from)
  const chartTo = endOfMonth(period.to)

  const [{ data: creators }, rpcRes, denomBase] =
    await Promise.all([
      supabase.from('creators').select('id, name, is_private'),
      // Agrégation EN BASE (migration 0052 overview_report, SECURITY INVOKER = RLS appliquée) :
      // par modèle (période) + série quotidienne (mois du graphe) + CA par chatteur (période,
      // source selon le rôle). Plus de fetchAll journalier ni de reduce JS. Non typé → cast.
      supabase.rpc('overview_report' as never, {
        p_period_from: period.from,
        p_period_to: period.to,
        p_chart_from: chartFrom,
        p_chart_to: chartTo,
        p_restricted: restricted,
      } as never) as unknown as PromiseLike<{ data: OverviewReport | null; error: { message: string } | null }>,
      // Dénominateur « Chatteurs actifs X / Y » : la RLS de `chatters` est tout-ou-rien
      // (un membre avec ≥1 modèle lit TOUTES les lignes) → en restricted, Y se compte
      // depuis `chatter_creators` (scopée à SES modèles, même source que getChatterScope).
      // Set (pas .size) : complété plus bas par les chatteurs à CA sur la période dont la
      // liaison a été désactivée depuis — sinon X > Y possible. fetchAll : cap PostgREST.
      restricted
        ? fetchAll((f, t) =>
            supabase
              .from('chatter_creators')
              .select('chatter_id')
              .eq('active', true)
              .order('chatter_id')
              .order('creator_id')
              .range(f, t),
          ).then(({ data }) => new Set((data ?? []).map((r) => r.chatter_id).filter(Boolean)))
        : supabase
            .from('chatters')
            .select('*', { count: 'exact', head: true })
            .then(({ count }) => count ?? 0),
    ])

  if (rpcRes.error) throw new Error(rpcRes.error.message)
  const rep = rpcRes.data ?? { by_model: [], daily: [], by_chatter: [] }

  const meta = new Map((creators ?? []).map((c) => [c.id, { name: c.name, isPrivate: c.is_private }]))
  const totalCa = rep.by_model.reduce((s, r) => s + (Number(r.ca) || 0), 0)

  // Agrégat par modèle (déjà sommé par le RPC, regroupé par nom).
  const byModel = new Map<string, { ca: number; subs: number; isPrivate: boolean }>()
  for (const r of rep.by_model) {
    const m = meta.get(r.creator_id)
    if (!m) continue
    const cur = byModel.get(m.name) ?? { ca: 0, subs: 0, isPrivate: m.isPrivate }
    cur.ca += Number(r.ca) || 0
    cur.subs += Number(r.new_subs) || 0
    byModel.set(m.name, cur)
  }
  const caByModel: ModelCa[] = [...byModel]
    .map(([name, m]) => ({
      name,
      ca: m.ca,
      part: totalCa ? round1((m.ca / totalCa) * 100) : 0,
      isPrivate: m.isPrivate,
    }))
    .sort((a, b) => b.ca - a.ca)
  const subsByModel: ModelSubs[] = [...byModel]
    .map(([name, m]) => ({ name, subs: m.subs }))
    .filter((x) => x.subs > 0)
    .sort((a, b) => b.subs - a.subs)

  // Série quotidienne : TOUS les jours du/des mois couvrant la sélection ; null après
  // aujourd'hui ; les jours hors sélection sont marqués `inPeriod: false` (affichés atténués).
  const perDay = new Map<string, number>()
  for (const r of rep.daily) perDay.set(r.date, Number(r.ca) || 0)
  const today = isoDate(new Date())
  const daily: DailyPoint[] = []
  for (let key = chartFrom; key <= chartTo; key = addDays(key, 1)) {
    daily.push({
      date: key,
      revenue: key <= today ? (perDay.get(key) ?? 0) : null,
      inPeriod: key >= period.from && key <= period.to,
    })
  }

  // Chatteurs : actifs, CA moyen et commission. Com = 10 % du CA en dur (cf. spec design —
  // à remplacer par la config de barème quand elle existera).
  const COM_RATE = 0.1
  const COM_FLOOR = 200
  const caByChatter = new Map<string, number>()
  for (const r of rep.by_chatter) caByChatter.set(r.chatter_id, Number(r.ca) || 0)
  const activeCas = [...caByChatter.values()].filter((v) => v > 0)
  const active = activeCas.length
  const avgCa = active ? activeCas.reduce((s, v) => s + v, 0) / active : 0
  const lowCom = [...caByChatter.values()].filter((v) => v * COM_RATE < COM_FLOOR).length
  // Y du KPI « Chatteurs actifs X / Y » : admin = count global ; restricted = liaisons
  // actives ∪ chatteurs avec CA sur la période (liaison désactivée depuis) — X ≤ Y garanti.
  const withCa = [...caByChatter.entries()].filter(([, v]) => v > 0).map(([id]) => id)
  const totalChatters =
    typeof denomBase === 'number' ? denomBase : new Set([...denomBase, ...withCa]).size

  const scopeHint = restricted ? 'sur tes modèles' : 'sur la période'
  const kpis: Kpi[] = [
    { key: 'ca', label: 'CA total', value: eur(totalCa), deltaPct: null, trendLabel: restricted ? 'Total (tes modèles)' : 'Total', hint: period.label },
    { key: 'active', label: 'Chatteurs actifs', value: `${active} / ${totalChatters}`, deltaPct: null, trendLabel: `${active} avec CA`, hint: scopeHint },
    { key: 'avgCa', label: 'CA moyen / chatteur', value: eur(avgCa), deltaPct: null, trendLabel: 'Moyenne des actifs', hint: restricted ? `${int(active)} chatteurs, ${scopeHint}` : `${int(active)} chatteurs avec CA` },
    // Com = définie sur le CA TOTAL d'un chatteur → incalculable sur un périmètre partiel.
    ...(restricted
      ? []
      : [{ key: 'lowCom', label: 'Sous 200 € de com', value: `${int(lowCom)} / ${int(caByChatter.size)}`, deltaPct: null, trendLabel: 'Com = 10 % du CA', hint: 'chatteurs sous le seuil' } satisfies Kpi]),
  ]

  // Insights : vides tant que le moteur de règles @glagency/core n'est pas branché.
  const insights: Insight[] = []

  return { periodLabel: period.label, kpis, caByModel, subsByModel, daily, insights }
}
