import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import type { ModelChatter, ModelRow, ModelsData } from '../types'

import { conv, round2 } from '@/lib/format'

/**
 * Onglet Modèles agrégé sur la période (datepicker du header).
 * Source : `creator_daily` (CA/PPV/tips/renew/abonnés/renouvellements) +
 * `chatter_creator_daily` (détail par chatteur) + `chatter_creators` (chatteurs assignés).
 */
export async function getModels(period: Period): Promise<ModelsData> {
  const supabase = await createClient()

  const [{ data: creators }, { data: cd }, { data: ccd }, { data: cc }, { data: chatters }] =
    await Promise.all([
      supabase.from('creators').select('id, name, is_private, excluded'),
      supabase
        .from('creator_daily')
        .select('creator_id, ca, ca_ppv, ca_tips, ca_renew, new_subs, renew_subs')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase
        .from('chatter_creator_daily')
        .select('creator_id, chatter_id, ca, ca_ppv, ca_tips, propose, vendu')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase.from('chatter_creators').select('creator_id, chatter_id').eq('active', true),
      supabase.from('chatters').select('id, display_name'),
    ])

  const chName = new Map((chatters ?? []).map((c) => [c.id, c.display_name]))

  const agg = new Map<
    string,
    { total: number; ppv: number; tips: number; renew: number; newSubs: number; renewals: number }
  >()
  for (const r of cd ?? []) {
    const a = agg.get(r.creator_id) ?? { total: 0, ppv: 0, tips: 0, renew: 0, newSubs: 0, renewals: 0 }
    a.total += r.ca ?? 0
    a.ppv += r.ca_ppv ?? 0
    a.tips += r.ca_tips ?? 0
    a.renew += r.ca_renew ?? 0
    a.newSubs += r.new_subs ?? 0
    a.renewals += r.renew_subs ?? 0
    agg.set(r.creator_id, a)
  }

  const planned = new Map<string, number>()
  for (const r of cc ?? []) planned.set(r.creator_id, (planned.get(r.creator_id) ?? 0) + 1)

  const breakdown = new Map<
    string,
    Map<string, { ca: number; ppv: number; tips: number; propose: number; vendu: number }>
  >()
  for (const r of ccd ?? []) {
    let byCh = breakdown.get(r.creator_id)
    if (!byCh) {
      byCh = new Map()
      breakdown.set(r.creator_id, byCh)
    }
    const c = byCh.get(r.chatter_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0 }
    c.ca += r.ca ?? 0
    c.ppv += r.ca_ppv ?? 0
    c.tips += r.ca_tips ?? 0
    c.propose += r.propose ?? 0
    c.vendu += r.vendu ?? 0
    byCh.set(r.chatter_id, c)
  }

  const models: ModelRow[] = (creators ?? [])
    .filter((c) => !c.excluded)
    .map((c) => {
      const a = agg.get(c.id) ?? { total: 0, ppv: 0, tips: 0, renew: 0, newSubs: 0, renewals: 0 }
      const byCh = breakdown.get(c.id) ?? new Map()
      const chattersArr: ModelChatter[] = [...byCh.entries()]
        .map(([id, x]) => ({
          name: chName.get(id) ?? '—',
          ca: x.ca,
          ppv: x.ppv,
          tips: x.tips,
          propose: x.propose,
          vendu: x.vendu,
          tauxConv: conv(x.vendu, x.propose),
        }))
        .sort((p, q) => q.ca - p.ca)
      const active = chattersArr.filter((x) => x.ca > 0).length
      return {
        id: c.id,
        name: c.name,
        total: a.total,
        newSubs: a.newSubs,
        renouv: a.renewals,
        ventes: chattersArr.reduce((s, x) => s + x.vendu, 0),
        caMsg: a.ppv + a.tips,
        ltv: a.newSubs ? round2(a.total / a.newSubs) : 0,
        part: 0, // % rempli après filtrage (plus fort reste → somme 100 %)
        ppv: a.ppv,
        tips: a.tips,
        renew: a.renew,
        active,
        planned: planned.get(c.id) ?? 0,
        per: active ? round2(a.total / active) : 0,
        nbChatters: chattersArr.length,
        chatters: chattersArr,
        isPrivate: c.is_private,
      }
    })
    .filter((m) => m.total > 0 || m.nbChatters > 0)
    .sort((a, b) => b.total - a.total)

  // Part CA : arrondi « plus fort reste » sur les modèles affichés → la colonne somme
  // toujours à 100 % (total agence = somme des modèles visibles ; exclus non comptés).
  const shownTotal = models.reduce((s, m) => s + m.total, 0)
  if (shownTotal > 0) {
    const exact = models.map((m) => (m.total / shownTotal) * 100)
    const parts = exact.map((x) => Math.floor(x))
    let rest = Math.round(100 - parts.reduce((s, x) => s + x, 0))
    exact
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac)
      .forEach(({ i }) => {
        if (rest > 0) {
          parts[i] += 1
          rest--
        }
      })
    models.forEach((m, i) => {
      m.part = parts[i] ?? 0
    })
  }

  return { period: period.label, models }
}
