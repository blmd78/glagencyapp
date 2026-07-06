import { addDays, frDayShort as frDay, mondayOf, round1 as r1, round2 as r2 } from '@glagency/core'
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

/**
 * Bilan hebdo par modèle. Tout vient de `creator_daily` (déjà ingéré — aucune requête
 * MyPuls, contrairement au legacy et ses ~15 s). RLS : un rôle `user` ne voit que ses
 * modèles, les totaux se recalculent sur son périmètre.
 */
export async function getBilan(week?: string | null): Promise<BilanData> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
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

  // Une seule plage couvrante [M-1 .. semaine] puis bucketing par fenêtre (volumes faibles).
  const [{ data: rows, error }, { data: creators, error: e2 }] = await Promise.all([
    supabase
      .from('creator_daily')
      .select('creator_id, date, ca, new_subs')
      .gte('date', lm.start)
      .lte('date', end),
    supabase.from('creators').select('id, name, excluded'),
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
      }
    })
    .sort((a, b) => b.ca - a.ca)

  // CA total et abonnés : TOUT (privés compris). LTV moyenne : hors comptes privés,
  // pour ne pas fausser le ratio (même règle que la page Santé).
  const totalCa = r2(models.reduce((s, m) => s + m.ca, 0))
  const totalNewSubs = models.reduce((s, m) => s + m.newSubs, 0)
  const pub = models.filter((m) => !m.excluded)
  const pubCa = pub.reduce((s, m) => s + m.ca, 0)
  const pubSubs = pub.reduce((s, m) => s + m.newSubs, 0)

  return {
    week: { start, end },
    prevWeek: prev,
    lastMonthWeek: lm,
    totalCa,
    totalNewSubs,
    avgLtv: ltvFormula(pubCa, pubSubs),
    models,
    weeks,
  }
}
