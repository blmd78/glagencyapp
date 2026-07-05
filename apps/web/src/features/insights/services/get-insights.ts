import { createClient } from '@/lib/supabase/server'
import type { InsightKpi, InsightModelSplit, InsightRow, InsightsData, InsightStatus } from '../types'

/**
 * Cartes d'une semaine (lundi YYYY-MM-DD) ou, sans argument, de la dernière semaine
 * générée : dernière génération PAR CLÉ (historisées), jointe aux états de traitement.
 * RLS : admin uniquement en v1 — un rôle `user` reçoit 0 ligne (état vide propre).
 */
export async function getInsights(week?: string | null): Promise<InsightsData> {
  const supabase = await createClient()

  let weekStart = week ?? null
  if (!weekStart) {
    // Dernière semaine générée (une requête légère plutôt qu'un scan complet).
    const { data: latest } = await supabase
      .from('insights')
      .select('week_start')
      .order('week_start', { ascending: false })
      .limit(1)
    weekStart = latest?.[0]?.week_start ?? null
  }
  if (!weekStart) return { weekStart: null, insights: [] }

  const [{ data: rows }, { data: states }] = await Promise.all([
    supabase
      .from('insights')
      .select('insight_key, generated_at, week_start, severity, title, body, action_plan, kpis, models')
      .eq('week_start', weekStart)
      .order('generated_at', { ascending: false }),
    supabase.from('insight_states').select('insight_key, status, note'),
  ])

  const stateByKey = new Map((states ?? []).map((s) => [s.insight_key, s]))
  const seen = new Set<string>()
  const insights: InsightRow[] = []
  for (const r of rows ?? []) {
    if (seen.has(r.insight_key)) continue // générations triées desc → la 1re est la dernière
    seen.add(r.insight_key)
    const st = stateByKey.get(r.insight_key)
    insights.push({
      key: r.insight_key,
      weekStart: r.week_start,
      severity: r.severity === 'critical' ? 'critical' : r.severity === 'ok' ? 'ok' : 'warning',
      title: r.title,
      body: r.body,
      actionPlan: r.action_plan,
      kpis: (r.kpis ?? []) as unknown as InsightKpi[],
      models: (r.models ?? []) as unknown as InsightModelSplit[],
      generatedAt: r.generated_at,
      status: (st?.status ?? 'new') as InsightStatus,
      note: st?.note ?? null,
    })
  }
  // Critiques d'abord, puis moyens, puis sains (ordre du moteur conservé ensuite).
  const rank = { critical: 0, warning: 1, ok: 2 } as const
  insights.sort((a, b) => rank[a.severity] - rank[b.severity])
  return { weekStart, insights }
}

/** Compteur sidebar : cartes de la dernière semaine encore à traiter (new/in_progress). RLS-scopé. */
export async function getOpenInsightsCount(): Promise<number> {
  const supabase = await createClient()
  const { data: latest } = await supabase
    .from('insights')
    .select('week_start')
    .order('week_start', { ascending: false })
    .limit(1)
  const weekStart = latest?.[0]?.week_start
  if (!weekStart) return 0
  const [{ data: rows }, { data: states }] = await Promise.all([
    // Les cartes « saines » ne comptent pas comme « à traiter ».
    supabase.from('insights').select('insight_key').eq('week_start', weekStart).neq('severity', 'ok'),
    supabase.from('insight_states').select('insight_key, status').in('status', ['resolved', 'ignored']),
  ])
  const closed = new Set((states ?? []).map((s) => s.insight_key))
  const keys = new Set((rows ?? []).map((r) => r.insight_key))
  return [...keys].filter((k) => !closed.has(k)).length
}
