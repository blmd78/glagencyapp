import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import type { ChatterModel, ChatterRow, ChattersData } from '../types'

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
const conv = (v: number, p: number) => (p ? round1((v / p) * 100) : 0)

/**
 * Onglet Chatteurs agrégé sur la période (datepicker du header).
 * Filtrage fait EN BASE (WHERE date BETWEEN from AND to) : on ne récupère que les
 * lignes de la période. Source : `chatter_daily` (agrégat chatteur) + `chatter_creator_daily`
 * (ventilation par modèle) + `chatter_creators` (modèles assignés).
 * ⚠️ `com` (commission) n'existe pas au grain jour → 0 pour l'instant.
 */
export async function getChatters(period: Period): Promise<ChattersData> {
  const supabase = await createClient()

  const [{ data: chatters }, { data: teams }, { data: creators }, { data: chd }, { data: ccd }, { data: cc }] =
    await Promise.all([
      supabase.from('chatters').select('id, display_name, email, active, team_id'),
      supabase.from('teams').select('id, name'),
      supabase.from('creators').select('id, name'),
      supabase
        .from('chatter_daily')
        .select('chatter_id, ca, ca_ppv, ca_tips, propose, vendu, presence_active_h, presence_idle_h, reactivite_sec')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase
        .from('chatter_creator_daily')
        .select('chatter_id, creator_id, ca, ca_ppv, ca_tips, propose, vendu')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase.from('chatter_creators').select('chatter_id, creator_id').eq('active', true),
    ])

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]))
  const crName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const chMeta = new Map((chatters ?? []).map((c) => [c.id, c]))

  const agg = new Map<
    string,
    { ca: number; ppv: number; tips: number; propose: number; vendu: number; pa: number; pi: number; react: number[] }
  >()
  for (const r of chd ?? []) {
    const a = agg.get(r.chatter_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0, pa: 0, pi: 0, react: [] }
    a.ca += r.ca ?? 0
    a.ppv += r.ca_ppv ?? 0
    a.tips += r.ca_tips ?? 0
    a.propose += r.propose ?? 0
    a.vendu += r.vendu ?? 0
    a.pa += r.presence_active_h ?? 0
    a.pi += r.presence_idle_h ?? 0
    if (r.reactivite_sec != null) a.react.push(r.reactivite_sec)
    agg.set(r.chatter_id, a)
  }

  const bd = new Map<string, Map<string, { ca: number; ppv: number; tips: number; propose: number; vendu: number }>>()
  for (const r of ccd ?? []) {
    let m = bd.get(r.chatter_id)
    if (!m) {
      m = new Map()
      bd.set(r.chatter_id, m)
    }
    const c = m.get(r.creator_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0 }
    c.ca += r.ca ?? 0
    c.ppv += r.ca_ppv ?? 0
    c.tips += r.ca_tips ?? 0
    c.propose += r.propose ?? 0
    c.vendu += r.vendu ?? 0
    m.set(r.creator_id, c)
  }

  const assigned = new Map<string, string[]>()
  for (const r of cc ?? []) {
    const n = crName.get(r.creator_id)
    if (!n) continue
    const arr = assigned.get(r.chatter_id) ?? []
    arr.push(n)
    assigned.set(r.chatter_id, arr)
  }

  const rows: ChatterRow[] = [...agg.entries()]
    .map(([id, a]) => {
      const meta = chMeta.get(id)
      const byCr = bd.get(id) ?? new Map()
      const models: ChatterModel[] = [...byCr.entries()]
        .map(([cid, x]) => ({
          model: crName.get(cid) ?? '—',
          ca: x.ca,
          ppv: x.ppv,
          tips: x.tips,
          propose: x.propose,
          vendu: x.vendu,
          tauxConv: conv(x.vendu, x.propose),
        }))
        .sort((p, q) => q.ca - p.ca)
      const attributed = models.reduce((s, m) => s + m.ca, 0)
      return {
        id,
        name: meta?.display_name ?? '—',
        email: meta?.email ?? null,
        active: meta?.active ?? false,
        team: meta?.team_id ? (teamName.get(meta.team_id) ?? null) : null,
        ca: a.ca,
        ppv: a.ppv,
        tips: a.tips,
        com: 0,
        propose: a.propose,
        vendu: a.vendu,
        tauxConv: conv(a.vendu, a.propose),
        presenceActiveH: round1(a.pa),
        presenceIdleH: round1(a.pi),
        reactiviteS: a.react.length
          ? Math.round(a.react.reduce((s, x) => s + x, 0) / a.react.length)
          : null,
        nbModels: models.filter((m) => m.ca > 0).length,
        caUnattributed: round2(a.ca - attributed),
        models,
        assignedModels: assigned.get(id) ?? [],
      }
    })
    .sort((p, q) => q.ca - p.ca)

  return { period: period.label, chatters: rows }
}
