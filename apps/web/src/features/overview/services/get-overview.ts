import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eachDayOfInterval, format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import type { DailyPoint, Insight, Kpi, ModelCa, ModelSubs, OverviewData } from '../types'

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`
const int = (n: number) => Math.round(n).toLocaleString('fr-FR')
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Overview agrégée sur la période choisie (datepicker du header).
 * Source : `creator_daily` (CA/modèle/abonnés/série) + `chatter_daily` (actifs/conversion).
 * Les insights viennent encore de la fixture (moteur de règles @glagency/core non branché,
 * et pas de dimension date). Le reste réagit au datepicker.
 */
export async function getOverview(period: Period): Promise<OverviewData> {
  const supabase = await createClient()

  const [{ data: creators }, { data: cd }, { data: chd }, { count: totalChatters }] =
    await Promise.all([
      supabase.from('creators').select('id, name, is_private'),
      supabase
        .from('creator_daily')
        .select('date, ca, new_subs, creator_id')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase
        .from('chatter_daily')
        .select('chatter_id, ca, propose, vendu')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase.from('chatters').select('*', { count: 'exact', head: true }),
    ])

  const meta = new Map((creators ?? []).map((c) => [c.id, { name: c.name, isPrivate: c.is_private }]))
  const rows = cd ?? []
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
  const totalSubs = subsByModel.reduce((s, x) => s + x.subs, 0)

  // Série quotidienne : TOUS les jours de la période ; null après aujourd'hui.
  const perDay = new Map<string, number>()
  for (const r of rows) perDay.set(r.date, (perDay.get(r.date) ?? 0) + (r.ca ?? 0))
  const today = format(new Date(), 'yyyy-MM-dd')
  const daily: DailyPoint[] = eachDayOfInterval({
    start: new Date(`${period.from}T00:00:00`),
    end: new Date(`${period.to}T00:00:00`),
  }).map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    return { date: key, revenue: key <= today ? (perDay.get(key) ?? 0) : null }
  })

  // Chatteurs actifs + conversion
  const chRows = chd ?? []
  const active = new Set(chRows.filter((r) => (r.ca ?? 0) > 0).map((r) => r.chatter_id)).size
  const sumProp = chRows.reduce((s, r) => s + (r.propose ?? 0), 0)
  const sumVendu = chRows.reduce((s, r) => s + (r.vendu ?? 0), 0)
  const conv = sumProp ? (sumVendu / sumProp) * 100 : 0

  const kpis: Kpi[] = [
    { key: 'ca', label: 'CA de la période', value: eur(totalCa), deltaPct: null, trendLabel: 'Total', hint: period.label },
    { key: 'subs', label: 'Nouveaux abonnés', value: int(totalSubs), deltaPct: null, trendLabel: 'Acquisition', hint: 'tous comptes' },
    { key: 'active', label: 'Chatteurs actifs', value: `${active} / ${totalChatters ?? 0}`, deltaPct: null, trendLabel: `${active} avec CA`, hint: 'sur la période' },
    { key: 'conv', label: 'Conversion globale', value: `${round1(conv).toLocaleString('fr-FR')} %`, deltaPct: null, trendLabel: 'Σ vendus / Σ proposés', hint: `${int(sumVendu)} / ${int(sumProp)}` },
  ]

  // Insights : encore issus de la fixture (pas de dimension date).
  let insights: Insight[] = []
  try {
    const fx = JSON.parse(
      readFileSync(join(process.cwd(), 'src/features/overview/_data/june-overview.json'), 'utf-8'),
    ) as { insights?: Insight[] }
    insights = fx.insights ?? []
  } catch {
    // fixture absente → pas d'insights
  }

  return { periodLabel: period.label, kpis, caByModel, subsByModel, daily, insights }
}
