import { addDays, frDayShort as frDay, isoDate, mondayOf, round1 as r1, round2 as r2 } from '@glagency/core'
import { ltvOf as ltvFormula } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
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

/** Ligne de `creator_script_daily` (0042, hors types générés → typée à la main). */
interface ScriptRow {
  creator_id: string
  date: string
  position: number | null
  revenue_day: number | null
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

  // Tables journalières : fetchAll (pagination PostgREST, tri = PK complète) — sur 5
  // semaines, creator_script_daily (créatrice × script × jour) dépasse 1000 lignes bien
  // avant creator_daily → sans ça, totaux et « hors S1 » tronqués EN SILENCE.
  const [{ data: rows, error }, { data: creators, error: e2 }, scriptsRes] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('creator_daily')
        .select('creator_id, date, ca, new_subs')
        .gte('date', lm.start)
        .lte('date', end)
        .order('creator_id')
        .order('date')
        .range(f, t),
    ),
    supabase.from('creators').select('id, name, excluded'),
    // Snapshots scripts MyPuls (0042, hors types générés) : deltas jour, position 1 = badge N°1.
    fetchAll<ScriptRow>(
      (f, t) =>
        supabase
          .from('creator_script_daily' as never)
          .select('creator_id, date, position, revenue_day')
          .gte('date', lm.start)
          .lte('date', end)
          .order('creator_id' as never)
          .order('script_id' as never)
          .order('date' as never)
          .range(f, t) as unknown as PromiseLike<{
          data: ScriptRow[] | null
          error: PostgrestError | null
        }>,
    ),
  ])
  if (error) throw error
  if (e2) throw e2

  const windows: Record<'cur' | 'prev' | 'lm', Map<string, Agg>> = {
    cur: new Map(),
    prev: new Map(),
    lm: new Map(),
  }
  const bump = (win: Map<string, Agg>, id: string, ca: number, ns: number) => {
    const a = win.get(id) ?? { ca: 0, newSubs: 0 }
    a.ca += ca
    a.newSubs += ns
    win.set(id, a)
  }
  for (const r of rows ?? []) {
    const win =
      r.date >= start && r.date <= end
        ? windows.cur
        : r.date >= prev.start && r.date <= prev.end
          ? windows.prev
          : r.date >= lm.start && r.date <= lm.end
            ? windows.lm
            : null
    if (win) bump(win, r.creator_id, r.ca ?? 0, r.new_subs ?? 0)
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
  // Erreur scripts NON bloquante (comme avant) : pas de snapshots → pas de badge, page valide.
  const scriptRows: ScriptRow[] = scriptsRes.data ?? []
  for (const r of scriptRows) {
    const win =
      r.date >= start && r.date <= end
        ? scriptWins.cur
        : r.date >= prev.start && r.date <= prev.end
          ? scriptWins.prev
          : r.date >= lm.start && r.date <= lm.end
            ? scriptWins.lm
            : null
    if (!win || r.revenue_day == null) continue
    const a = win.get(r.creator_id) ?? { autres: 0, mesure: false }
    a.mesure = true
    if (r.position !== 1) a.autres += r.revenue_day
    win.set(r.creator_id, a)
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
