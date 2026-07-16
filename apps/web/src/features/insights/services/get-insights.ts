import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { InsightBilan, InsightKpi, InsightModelSplit, InsightRow, InsightsData, InsightStatus, WeekTracking } from '../types'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Timestamp de la dernière génération d'une semaine (1 ligne). */
async function latestGeneration(supabase: Supabase, weekStart: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('insights')
    .select('generated_at')
    .eq('week_start', weekStart)
    .order('generated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return data?.[0]?.generated_at ?? null
}

/**
 * Cartes d'une semaine (lundi YYYY-MM-DD) ou, sans argument, de la dernière semaine
 * générée : dernière génération PAR CLÉ (historisées), jointe aux états de traitement.
 * Cloisonnement v2 (migration 0015) : la RLS ne livre à un rôle `user` que les cartes
 * touchant SES modèles ; `restricted` masque EN PLUS le contenu multi-modèles
 * (splits des modèles non assignés, chips globales) quand la carte déborde.
 */
export async function getInsights(
  week?: string | null,
  opts: { restricted?: boolean } = {},
): Promise<InsightsData> {
  const restricted = opts.restricted ?? false
  const supabase = await createClient()

  // Modèles accessibles (RLS 0008 : un rôle user ne lit que SES creators).
  let mineIds: Set<string> = new Set()
  let mineNames: Set<string> = new Set()
  if (restricted) {
    const { data: mine, error } = await supabase.from('creators').select('id, name')
    if (error) throw new Error(error.message)
    mineIds = new Set((mine ?? []).map((c) => c.id))
    mineNames = new Set((mine ?? []).map((c) => c.name))
  }

  let weekStart = week ?? null
  if (!weekStart) {
    // Dernière semaine générée (une requête légère plutôt qu'un scan complet).
    const { data: latest, error } = await supabase
      .from('insights')
      .select('week_start')
      .order('week_start', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    weekStart = latest?.[0]?.week_start ?? null
  }
  if (!weekStart) return { weekStart: null, insights: [] }

  // Ne charger QUE la dernière génération (les générations s'empilent chaque nuit :
  // sans ce filtre on transférerait N×131 lignes pour n'en garder que 131).
  const genAt = await latestGeneration(supabase, weekStart)
  if (!genAt) return { weekStart, insights: [] }

  const [
    { data: rows, error: rowsErr },
    { data: states, error: statesErr },
    { data: profiles, error: profilesErr },
  ] = await Promise.all([
    supabase
      .from('insights')
      .select('insight_key, generated_at, week_start, severity, title, body, action_plan, kpis, models, week')
      .eq('week_start', weekStart)
      .eq('generated_at', genAt),
    // `insight_states` grossit d'une ligne par (semaine, chatteur) chaque génération —
    // pas de fenêtre naturelle pour borner, et le volume dépasse la limite PostgREST
    // (1000 lignes) en environ un an → fetchAll, tri sur la PK (`insight_key`).
    fetchAll((f, t) =>
      supabase
        .from('insight_states')
        .select('insight_key, status, note, bilan, updated_at, updated_by')
        .order('insight_key')
        .range(f, t),
    ),
    // `profiles` (comptes internes) : petit effectif dans les faits, mais nu et non
    // borné tel quel → fetchAll par cohérence/anti-régression (coût marginal nul ici).
    fetchAll((f, t) => supabase.from('profiles').select('id, display_name, email').order('id').range(f, t)),
  ])
  if (rowsErr) throw new Error(rowsErr.message)
  if (statesErr) throw new Error(statesErr.message)
  if (profilesErr) throw new Error(profilesErr.message)

  const stateByKey = new Map((states ?? []).map((s) => [s.insight_key, s]))
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name || p.email || '—']),
  )
  const seen = new Set<string>()
  const insights: InsightRow[] = []
  for (const r of rows ?? []) {
    if (seen.has(r.insight_key)) continue // ceinture (une génération = une ligne par clé)
    seen.add(r.insight_key)
    const st = stateByKey.get(r.insight_key)
    // Masquage par modèle : les vieux splits (avant 0015) n'ont pas creatorId → repli nom.
    const allModels = (r.models ?? []) as unknown as InsightModelSplit[]
    const models = restricted
      ? allModels.filter((m) => (m.creatorId ? mineIds.has(m.creatorId) : mineNames.has(m.name)))
      : allModels
    // Les chips globales (kpis, suivi semaine) agrègent TOUS les modèles du chatteur :
    // on ne les garde que si la carte est entièrement dans le périmètre de l'utilisateur.
    const full = !restricted || models.length === allModels.length
    insights.push({
      key: r.insight_key,
      weekStart: r.week_start,
      severity: r.severity === 'critical' ? 'critical' : r.severity === 'ok' ? 'ok' : 'warning',
      title: r.title,
      body: r.body,
      actionPlan: r.action_plan,
      kpis: full ? ((r.kpis ?? []) as unknown as InsightKpi[]) : [],
      models,
      generatedAt: r.generated_at,
      status: (st?.status ?? 'new') as InsightStatus,
      note: st?.note ?? null,
      bilan: (st?.bilan ?? null) as unknown as InsightBilan | null,
      week: full ? ((r.week ?? null) as unknown as WeekTracking | null) : null,
      updatedAt: st?.updated_at ?? null,
      updatedBy: st?.updated_by ?? null,
      updatedByName: st?.updated_by ? (nameById.get(st.updated_by) ?? '—') : null,
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
  // 1 requête pour (dernière semaine, dernière génération) au lieu de 2 en série — ce
  // compteur est dans le chemin bloquant du layout (chaque hard load + chaque action).
  const { data: latest, error: latestErr } = await supabase
    .from('insights')
    .select('week_start, generated_at')
    .order('week_start', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(1)
  if (latestErr) throw new Error(latestErr.message)
  const weekStart = latest?.[0]?.week_start
  const genAt = latest?.[0]?.generated_at
  if (!weekStart || !genAt) return 0
  const [{ data: rows, error: rowsErr }, { data: states, error: statesErr }] = await Promise.all([
    // Dernière génération uniquement + les « saines » ne comptent pas comme « à traiter ».
    supabase
      .from('insights')
      .select('insight_key')
      .eq('week_start', weekStart)
      .eq('generated_at', genAt)
      .neq('severity', 'ok'),
    // Même table que `getInsights` (fetchAll obligatoire — cf. commentaire ci-dessus).
    fetchAll((f, t) =>
      supabase
        .from('insight_states')
        .select('insight_key, status')
        .in('status', ['resolved', 'ignored'])
        .order('insight_key')
        .range(f, t),
    ),
  ])
  if (rowsErr) throw new Error(rowsErr.message)
  if (statesErr) throw new Error(statesErr.message)
  const closed = new Set((states ?? []).map((s) => s.insight_key))
  const keys = new Set((rows ?? []).map((r) => r.insight_key))
  return [...keys].filter((k) => !closed.has(k)).length
}
