import { createClient } from '@/lib/supabase/server'
import type { CaseKind, CaseSnapshot } from '@/lib/types/training'
import type { ChatterDetail } from '../types'

/** `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number(). */
const num = (v: number | string): number => Number(v)

/**
 * Fiche d'un chatter pour l'encadrant, en 3 lectures parallèles (client utilisateur = RLS —
 * `training_case_bests` / `training_sessions` ouvrent la lecture à `has_page('frm-suivi')`,
 * 0117/0118 ; un appelant sans le droit lit 0 ligne).
 *
 * `training_axis_profile` est `security invoker` : elle voit ce que l'appelant voit, donc les
 * moyennes par axe d'un chatter ne sortent que pour un encadrant. Elle exclut le boss (barème
 * différent, /100 par étape) et rend déjà les axes du plus faible au plus fort.
 *
 * Pas de `displayName` ici : il vient du roster côté Template (cf. `ChatterDetail`).
 */
export async function getChatter(profileId: string): Promise<ChatterDetail> {
  const supabase = await createClient()
  const [bestsRes, sessionsRes, axesRes] = await Promise.all([
    supabase
      .from('training_case_bests')
      .select('case_id, best_total, attempts, last_at, training_cases!inner(title, kind, training_modules!inner(code, title))')
      .eq('profile_id', profileId)
      .order('last_at', { ascending: false }),
    supabase
      .from('training_sessions')
      .select('id, kind, status, total, started_at, case_snapshot')
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase.rpc('training_axis_profile', { p_profile: profileId }),
  ])
  if (bestsRes.error) throw new Error(bestsRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  if (axesRes.error) throw new Error(axesRes.error.message)

  return {
    profileId,
    bests: (bestsRes.data ?? []).map((b) => ({
      caseId: b.case_id,
      caseTitle: b.training_cases.title,
      moduleTitle: b.training_cases.training_modules.title,
      moduleCode: b.training_cases.training_modules.code,
      kind: b.training_cases.kind as CaseKind,
      bestTotal: b.best_total,
      attempts: b.attempts,
      lastAt: b.last_at,
    })),
    sessions: (sessionsRes.data ?? []).map((s) => {
      // Titre du cas depuis le SNAPSHOT (pas de jointure) : il dit ce qui a été joué ce jour-là,
      // même si le cas a été renommé ou désactivé depuis.
      const snap = s.case_snapshot as unknown as CaseSnapshot
      return {
        id: s.id,
        caseTitle: snap?.title ?? 'Cas',
        kind: s.kind as CaseKind,
        status: s.status,
        total: s.total,
        startedAt: s.started_at,
      }
    }),
    axes: (axesRes.data ?? []).map((a) => ({
      key: a.axis_key,
      name: a.axis_name,
      avg: num(a.avg_score),
      n: a.n,
    })),
  }
}
