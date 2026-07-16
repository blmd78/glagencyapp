import { addDays, frDayShort as frDay, isoDate, mondayOf, round1 as r1, round2 as r2 } from '@glagency/core'
import { ltvOf as ltvFormula } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { BilanData, ModelBilan, WeekChoice } from '../types'

/** Semaines complètes (lun→dim) COUVERTES PAR LA BASE, la plus récente d'abord
 *  (12 max) — pas de semaines vides avant la première donnée ingérée. */
function completeWeeks(today: string, minDate: string | null): WeekChoice[] {
  const currentMonday = mondayOf(today)
  const firstMonday = minDate ? mondayOf(minDate) : null
  const out: WeekChoice[] = []
  for (let i = 1; i <= 12; i++) {
    const start = addDays(currentMonday, -7 * i)
    if (firstMonday && start < firstMonday) break
    out.push({ start, end: addDays(start, 6), label: `Sem. du ${frDay(start)} au ${frDay(addDays(start, 6))}` })
  }
  return out
}

interface Agg {
  ca: number
  newSubs: number
}

/** Forme brute renvoyée par le RPC `bilan_report` (migration 0051) — 3 fenêtres agrégées EN BASE. */
interface BilanReport {
  by_creator: Array<{
    creator_id: string
    ca_cur: number | null
    ns_cur: number | null
    ca_prev: number | null
    ns_prev: number | null
    ca_lm: number | null
    ns_lm: number | null
  }>
  script: Array<{
    creator_id: string
    autres_cur: number | null
    mesure_cur: boolean
    autres_prev: number | null
    mesure_prev: boolean
    autres_lm: number | null
    mesure_lm: boolean
  }>
}

/**
 * Bilan hebdo par modèle. Tout vient de `creator_daily` (déjà ingéré — aucune requête
 * MyPuls, contrairement au legacy et ses ~15 s). RLS : un rôle `user` ne voit que ses
 * modèles, les totaux se recalculent sur son périmètre.
 */
export async function getBilan(week?: string | null): Promise<BilanData> {
  const supabase = await createClient()
  const today = isoDate(new Date())
  // Première donnée disponible (RLS-scopée) → borne du sélecteur.
  const { data: first } = await supabase
    .from('creator_daily')
    .select('date')
    .order('date', { ascending: true })
    .limit(1)
  const weeks = completeWeeks(today, first?.[0]?.date ?? null)
  if (weeks.length === 0) {
    const start = mondayOf(addDays(today, -7))
    weeks.push({ start, end: addDays(start, 6), label: `Sem. du ${frDay(start)} au ${frDay(addDays(start, 6))}` })
  }

  const requested = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : null
  const start = weeks.some((w) => w.start === requested) ? (requested as string) : weeks[0]!.start
  const end = addDays(start, 6)
  const prev = { start: addDays(start, -7), end: addDays(end, -7) }
  const lm = { start: addDays(start, -28), end: addDays(end, -28) }

  // Agrégation EN BASE (migration 0051 bilan_report, SECURITY INVOKER = RLS appliquée) :
  // les 3 fenêtres (cur/prev/lm) sont sommées en Postgres → plus de fetchAll de milliers
  // de lignes ni de bucketing JS. Non typé (Functions vide) → cast.
  const [rpcRes, { data: creators, error: e2 }] = await Promise.all([
    supabase.rpc('bilan_report' as never, {
      p_start: start,
      p_end: end,
      p_prev_start: prev.start,
      p_prev_end: prev.end,
      p_lm_start: lm.start,
      p_lm_end: lm.end,
    } as never) as unknown as PromiseLike<{ data: BilanReport | null; error: { message: string } | null }>,
    supabase.from('creators').select('id, name, excluded'),
  ])
  if (rpcRes.error) throw new Error(rpcRes.error.message)
  if (e2) throw e2
  const rep = rpcRes.data ?? { by_creator: [], script: [] }

  // Fenêtres CA/abonnés par modèle (déjà sommées par le RPC). ltvOf(0,0)=null → remplir
  // les 3 fenêtres pour chaque modèle est équivalent à ne créer l'entrée que si présente.
  const windows: Record<'cur' | 'prev' | 'lm', Map<string, Agg>> = {
    cur: new Map(),
    prev: new Map(),
    lm: new Map(),
  }
  for (const r of rep.by_creator) {
    windows.cur.set(r.creator_id, { ca: Number(r.ca_cur) || 0, newSubs: Number(r.ns_cur) || 0 })
    windows.prev.set(r.creator_id, { ca: Number(r.ca_prev) || 0, newSubs: Number(r.ns_prev) || 0 })
    windows.lm.set(r.creator_id, { ca: Number(r.ca_lm) || 0, newSubs: Number(r.ns_lm) || 0 })
  }

  // CA scripté par fenêtre : autres = somme des scripts HORS N°1 (position ≠ 1),
  // mesure = au moins une valeur jour connue (non-null).
  interface ScriptAgg {
    autres: number
    mesure: boolean
  }
  const scriptWins: Record<'cur' | 'prev' | 'lm', Map<string, ScriptAgg>> = {
    cur: new Map(),
    prev: new Map(),
    lm: new Map(),
  }
  // Scripts hors N°1 par fenêtre — déjà agrégés par le RPC (autres = Σ position≠1,
  // mesure = ≥1 valeur jour connue). Entrée posée seulement quand mesure=true (identique
  // au reduce JS qui ne créait l'entrée que sur une valeur non-null).
  for (const r of rep.script) {
    if (r.mesure_cur) scriptWins.cur.set(r.creator_id, { autres: Number(r.autres_cur) || 0, mesure: true })
    if (r.mesure_prev) scriptWins.prev.set(r.creator_id, { autres: Number(r.autres_prev) || 0, mesure: true })
    if (r.mesure_lm) scriptWins.lm.set(r.creator_id, { autres: Number(r.autres_lm) || 0, mesure: true })
  }
  // % = CA des scripts AUTRES que le N°1 ÷ CA total de la fenêtre (le CA non scripté
  // ne compte pas dans le numérateur — demande Benoit : « tous les scripts sauf le N°1 »).
  const horsS1Of = (sa: ScriptAgg | undefined, agg: Agg | undefined): number | null => {
    if (!sa?.mesure || !agg || agg.ca <= 0) return null
    return Math.max(0, Math.min(100, 100 * (sa.autres / agg.ca)))
  }

  const creatorById = new Map((creators ?? []).map((c) => [c.id, c]))
  const ids = new Set([...windows.cur.keys(), ...windows.prev.keys(), ...windows.lm.keys()])
  const ltvOf = (a: Agg | undefined) => (a ? ltvFormula(a.ca, a.newSubs) : null)

  const models: ModelBilan[] = [...ids]
    .map((id) => {
      const cur = windows.cur.get(id)
      const pv = windows.prev.get(id)
      const lw = windows.lm.get(id)
      return {
        id,
        name: creatorById.get(id)?.name ?? '—',
        excluded: creatorById.get(id)?.excluded ?? false,
        ca: r2(cur?.ca ?? 0),
        caPrev: r2(pv?.ca ?? 0),
        caLm: r2(lw?.ca ?? 0),
        newSubs: cur?.newSubs ?? 0,
        newSubsPrev: pv?.newSubs ?? 0,
        newSubsLm: lw?.newSubs ?? 0,
        ltv: ltvOf(cur),
        ltvPrev: ltvOf(pv),
        ltvLm: ltvOf(lw),
        horsS1: horsS1Of(scriptWins.cur.get(id), cur),
        horsS1Prev: horsS1Of(scriptWins.prev.get(id), pv),
        horsS1Lm: horsS1Of(scriptWins.lm.get(id), lw),
      }
    })
    .sort((a, b) => b.ca - a.ca)

  // CA total et abonnés : TOUT (privés compris). LTV moyenne : hors comptes privés,
  // pour ne pas fausser le ratio (même règle que la page Santé).
  const totalCa = r2(models.reduce((s, m) => s + m.ca, 0))
  const totalNewSubs = models.reduce((s, m) => s + m.newSubs, 0)
  // Mêmes règles sur les fenêtres de référence (S-1 / M-1) — pour les écarts des totaux.
  const totalCaPrev = r2(models.reduce((s, m) => s + m.caPrev, 0))
  const totalCaLm = r2(models.reduce((s, m) => s + m.caLm, 0))
  const totalNewSubsPrev = models.reduce((s, m) => s + m.newSubsPrev, 0)
  const totalNewSubsLm = models.reduce((s, m) => s + m.newSubsLm, 0)
  // Total global « hors S1 » (€) : somme des scripts ≠ Pos 1 sur la semaine courante.
  let totalHorsS1: number | null = null
  for (const sa of scriptWins.cur.values()) {
    if (!sa.mesure) continue
    totalHorsS1 = (totalHorsS1 ?? 0) + sa.autres
  }

  const pub = models.filter((m) => !m.excluded)
  const pubCa = pub.reduce((s, m) => s + m.ca, 0)
  const pubSubs = pub.reduce((s, m) => s + m.newSubs, 0)

  return {
    week: { start, end },
    prevWeek: prev,
    lastMonthWeek: lm,
    totalCa,
    totalCaPrev,
    totalCaLm,
    totalNewSubs,
    totalNewSubsPrev,
    totalNewSubsLm,
    totalHorsS1,
    avgLtv: ltvFormula(pubCa, pubSubs),
    avgLtvPrev: ltvFormula(
      pub.reduce((s, m) => s + m.caPrev, 0),
      pub.reduce((s, m) => s + m.newSubsPrev, 0),
    ),
    avgLtvLm: ltvFormula(
      pub.reduce((s, m) => s + m.caLm, 0),
      pub.reduce((s, m) => s + m.newSubsLm, 0),
    ),
    models,
    weeks,
  }
}
