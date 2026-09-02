import { createClient } from '@/lib/supabase/server'
import type { CaseSnapshot } from '@/lib/types/training'
import { COST_WINDOW_DAYS, type CostRow, type OverviewData, type ReportRow, type RosterRow } from '../types'

/**
 * Prix LISTE Anthropic en $ par million de tokens : [entrée, sortie]. Le coût affiché est une
 * ESTIMATION — la facture réelle peut être plus basse (remises/promos) et ces prix bougent :
 * un modèle inconnu de cette table compte 0 (mieux qu'un chiffre faux), il apparaît quand même
 * dans le détail par jour × modèle, donc l'écart se voit.
 */
const AI_PRICES: Record<string, [input: number, output: number]> = {
  'claude-haiku-4-5': [1, 5],
  // Sonnet 5 = 2/10. Le 3/15 qui était ici est le tarif de Sonnet 4.6 : le coût de la notation
  // était surestimé de 50 %. Ne pas recopier le prix d'une génération sur la suivante.
  'claude-sonnet-5': [2, 10],
}
/** Lecture de cache facturée ~10 % du prix d'entrée. */
const CACHE_READ_RATIO = 0.1
/**
 * ÉCRITURE de cache : 2× le prix d'entrée en TTL 1 h — le seul TTL utilisé par le projet
 * (`score.ts`). Ce n'est pas une constante universelle : en TTL 5 minutes c'est 1,25×. À revoir si
 * un appel passe au TTL court, sinon le coût de la notation serait surestimé de 60 %.
 */
const CACHE_WRITE_RATIO = 2

/** `numeric`/`bigint` Postgres : supabase-js peut les rendre en chaîne selon la version → Number(). */
const numOrNull = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v))
const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v))

/**
 * Tout l'Overview encadrant en 4 lectures parallèles (client utilisateur = RLS) :
 *
 * - `training_overview_roster` (RPC 0118/0119, definer, gardée par `has_page('frm-suivi')`) —
 *   les chatters AYANT le droit Entraînement, nouveaux d'abord puis par nom, `streak_days` déjà
 *   effectif. Roster NON cloisonné par modèle (spec §7) : qui a Suivi voit toute la promo.
 * - les notes contestées (RLS `training_reports_read` : propriétaire ou encadrant), 100 dernières ;
 *   le nom vient du roster (une RPC de moins), le titre du cas du SNAPSHOT de la session.
 * - le nombre de cas actifs HORS boss = dénominateur des « cas validés » (même définition que
 *   `training_profile_stats.cases_done`, cf. 0119 — sinon le roster afficherait des x/total faux).
 * - le coût IA, ADMIN SEULEMENT : `training_ai_cost` est `security invoker` et la RLS de
 *   `training_ai_calls` est admin-only — un non-admin lirait 0 ligne, autant ne pas appeler.
 */
export async function getOverview(isAdmin: boolean): Promise<OverviewData> {
  const supabase = await createClient()
  const since = new Date(Date.now() - COST_WINDOW_DAYS * 86_400_000).toISOString()
  const [rosterRes, reportsRes, casesRes, costRes] = await Promise.all([
    supabase.rpc('training_overview_roster'),
    supabase
      .from('training_reports')
      .select('id, session_id, profile_id, message, created_at, resolved_at, training_sessions!inner(total, case_snapshot)')
      // Non traités D'ABORD (`resolved_at` null), puis du plus récent au plus ancien : la fenêtre
      // de 100 lignes ne peut jamais faire disparaître un signalement en attente derrière des
      // traités plus récents.
      .order('resolved_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('training_cases').select('id', { count: 'exact', head: true }).eq('active', true).neq('kind', 'boss'),
    isAdmin ? supabase.rpc('training_ai_cost', { p_since: since }) : null,
  ])
  if (rosterRes.error) throw new Error(rosterRes.error.message)
  if (reportsRes.error) throw new Error(reportsRes.error.message)
  if (casesRes.error) throw new Error(casesRes.error.message)
  if (costRes?.error) throw new Error(costRes.error.message)

  const roster: RosterRow[] = (rosterRes.data ?? []).map((r) => ({
    profileId: r.profile_id,
    displayName: r.display_name,
    isNew: r.is_new,
    arrivedAt: r.arrived_at,
    models: r.models ?? [],
    casesDone: r.cases_done,
    avgTotal: numOrNull(r.avg_total),
    points: r.points,
    bossBest: r.boss_best,
    bossDone: r.boss_done,
    streakDays: r.streak_days,
    lastSessionAt: r.last_session_at,
    sessionsScored: r.sessions_scored,
  }))
  const names = new Map(roster.map((r) => [r.profileId, r.displayName]))

  const reports: ReportRow[] = (reportsRes.data ?? []).map((r) => {
    const snap = r.training_sessions.case_snapshot as unknown as CaseSnapshot
    return {
      id: r.id,
      sessionId: r.session_id,
      profileId: r.profile_id,
      // '—' : un signalement peut venir de quelqu'un qui n'est plus dans le roster (parti, droit
      // Entraînement retiré) — la ligne reste lisible et actionnable.
      displayName: names.get(r.profile_id) ?? '—',
      message: r.message,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      caseTitle: snap?.title ?? 'Cas',
      total: r.training_sessions.total,
    }
  })

  const costRows: CostRow[] = (costRes?.data ?? []).map((c) => ({
    day: c.day,
    model: c.model,
    kind: c.kind,
    calls: c.calls,
    inputTokens: num(c.input_tokens),
    outputTokens: num(c.output_tokens),
    cacheReadTokens: num(c.cache_read_tokens),
    cacheWriteTokens: num(c.cache_write_tokens),
  }))

  return {
    roster,
    reports,
    cost: costRes ? { rows: costRows, estimatedUsd: estimateUsd(costRows) } : null,
    totalCases: casesRes.count ?? 0,
  }
}

/** Σ (entrée × prix_in + sortie × prix_out + cache lu × 0,1×prix_in + cache écrit × 2×prix_in) ÷ 1e6, prix liste. */
function estimateUsd(rows: CostRow[]): number {
  let usd = 0
  for (const r of rows) {
    // Rapprochement par PRÉFIXE : l'API rend un identifiant daté (`claude-haiku-4-5-20251001`),
    // qu'une correspondance exacte manquait — tout le coût tombait donc à 0 (vérifié sur l'UAT :
    // 18 appels fan, ~30 000 tokens d'entrée, affichés 0 $). Ajouter la clé datée aurait rouvert
    // le trou au prochain instantané de modèle.
    const price = Object.entries(AI_PRICES).find(([k]) => r.model.startsWith(k))?.[1]
    if (!price) continue // modèle hors table de prix → 0 (cf. AI_PRICES)
    const [pIn, pOut] = price
    usd += (r.inputTokens * pIn + r.outputTokens * pOut + r.cacheReadTokens * pIn * CACHE_READ_RATIO + r.cacheWriteTokens * pIn * CACHE_WRITE_RATIO) / 1e6
  }
  return usd
}
