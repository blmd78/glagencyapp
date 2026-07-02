import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import type { DailyPoint, Insight, Kpi, ModelCa, ModelSubs, OverviewData } from '../types'

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`
const int = (n: number) => Math.round(n).toLocaleString('fr-FR')
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Overview agrégée sur la période choisie (datepicker du header).
 * Source : `creator_daily` (CA/modèle/abonnés/série) + `chatter_daily` (actifs/com).
 * Tout vient de la DB (ingestion quotidienne 23h59) ; insights vides tant que le
 * moteur de règles @glagency/core n'est pas branché.
 */
export async function getOverview(period: Period): Promise<OverviewData> {
  const supabase = await createClient()

  // Le graphe CA quotidien couvre toujours le(s) mois entier(s) de la sélection :
  // on élargit la requête `creator_daily`, mais KPIs/classements restent bornés à la période.
  const chartFrom = format(startOfMonth(new Date(`${period.from}T00:00:00`)), 'yyyy-MM-dd')
  const chartTo = format(endOfMonth(new Date(`${period.to}T00:00:00`)), 'yyyy-MM-dd')

  const [{ data: creators }, { data: cd }, { data: chd }, { count: totalChatters }] =
    await Promise.all([
      supabase.from('creators').select('id, name, is_private'),
      supabase
        .from('creator_daily')
        .select('date, ca, new_subs, creator_id')
        .gte('date', chartFrom)
        .lte('date', chartTo),
      supabase
        .from('chatter_daily')
        .select('chatter_id, ca')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase.from('chatters').select('*', { count: 'exact', head: true }),
    ])

  const meta = new Map((creators ?? []).map((c) => [c.id, { name: c.name, isPrivate: c.is_private }]))
  const monthRows = cd ?? []
  const rows = monthRows.filter((r) => r.date >= period.from && r.date <= period.to)
  const totalCa = rows.reduce((s, r) => s + (r.ca ?? 0), 0)

  // Agrégat par modèle
  const byModel = new Map<string, { ca: number; subs: number; isPrivate: boolean }>()
  for (const r of rows) {
    const m = meta.get(r.creator_id)
    if (!m) continue
    const cur = byModel.get(m.name) ?? { ca: 0, subs: 0, isPrivate: m.isPrivate }
    cur.ca += r.ca ?? 0
    cur.subs += r.new_subs ?? 0
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
  for (const r of monthRows) perDay.set(r.date, (perDay.get(r.date) ?? 0) + (r.ca ?? 0))
  const today = format(new Date(), 'yyyy-MM-dd')
  const daily: DailyPoint[] = eachDayOfInterval({
    start: new Date(`${chartFrom}T00:00:00`),
    end: new Date(`${chartTo}T00:00:00`),
  }).map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    return {
      date: key,
      revenue: key <= today ? (perDay.get(key) ?? 0) : null,
      inPeriod: key >= period.from && key <= period.to,
    }
  })

  // Chatteurs : actifs, CA moyen et commission. Com = 10 % du CA en dur (cf. spec design —
  // à remplacer par la config de barème quand elle existera).
  const COM_RATE = 0.1
  const COM_FLOOR = 200
  const caByChatter = new Map<string, number>()
  for (const r of chd ?? []) {
    caByChatter.set(r.chatter_id, (caByChatter.get(r.chatter_id) ?? 0) + (r.ca ?? 0))
  }
  const activeCas = [...caByChatter.values()].filter((v) => v > 0)
  const active = activeCas.length
  const avgCa = active ? activeCas.reduce((s, v) => s + v, 0) / active : 0
  const lowCom = [...caByChatter.values()].filter((v) => v * COM_RATE < COM_FLOOR).length

  const kpis: Kpi[] = [
    { key: 'ca', label: 'CA total', value: eur(totalCa), deltaPct: null, trendLabel: 'Total', hint: period.label },
    { key: 'active', label: 'Chatteurs actifs', value: `${active} / ${totalChatters ?? 0}`, deltaPct: null, trendLabel: `${active} avec CA`, hint: 'sur la période' },
    { key: 'avgCa', label: 'CA moyen / chatteur', value: eur(avgCa), deltaPct: null, trendLabel: 'Moyenne des actifs', hint: `${int(active)} chatteurs avec CA` },
    { key: 'lowCom', label: 'Sous 200 € de com', value: `${int(lowCom)} / ${int(caByChatter.size)}`, deltaPct: null, trendLabel: 'Com = 10 % du CA', hint: 'chatteurs sous le seuil' },
  ]

  // Insights : vides tant que le moteur de règles @glagency/core n'est pas branché.
  const insights: Insight[] = []

  return { periodLabel: period.label, kpis, caByModel, subsByModel, daily, insights }
}
