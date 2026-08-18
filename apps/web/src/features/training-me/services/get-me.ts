import { MEDAL_OR, bossUnlocked, computeTrophies, effectiveStreak, medalFor, moduleProgress, todayParis } from '@glagency/core'
import { getAllCases, getModuleRefs } from '@/lib/services/training-public'
import { createClient } from '@/lib/supabase/server'
import type { CaseKind, CaseSnapshot } from '@/lib/types/training'
import type { MeData, MeModule, MeSession, RankRow } from '../types'

/** `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number(). */
const numOrNull = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v))

/**
 * Tout « Ma formation » en 6 lectures parallèles (RLS visiteur) : ses stats, ses meilleurs
 * résultats, ses 50 dernières sessions, le classement (RPC `training_ranking`, noms + agrégats),
 * le catalogue des modules et celui des cas actifs.
 *
 * `.eq('profile_id', profileId)` explicite partout : les policies de `training_case_bests` /
 * `training_profile_stats` ouvrent la lecture au-delà du propriétaire (encadrant Suivi, face
 * Formation) — le filtre applicatif est ce qui rend la page « mienne ».
 *
 * Le streak stocké vaut la série AU DERNIER JOUR ACTIF et ne se périme pas tout seul :
 * `effectiveStreak` le remet à 0 si le dernier jour actif est antérieur à hier (Paris). La RPC
 * du classement, elle, renvoie déjà la valeur effective (0119).
 */
export async function getMe(profileId: string): Promise<MeData> {
  const supabase = await createClient()
  const [statsRes, bestsRes, sessionsRes, rankRes, modules, allCases] = await Promise.all([
    supabase.from('training_profile_stats').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('training_case_bests').select('case_id, best_total, attempts').eq('profile_id', profileId),
    supabase
      .from('training_sessions')
      .select('id, case_id, kind, status, total, objective_reached, started_at, case_snapshot')
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase.rpc('training_ranking'),
    getModuleRefs(),
    getAllCases(),
  ])
  if (statsRes.error) throw new Error(statsRes.error.message)
  if (bestsRes.error) throw new Error(bestsRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  if (rankRes.error) throw new Error(rankRes.error.message)

  const bests = new Map((bestsRes.data ?? []).map((b) => [b.case_id, { bestTotal: b.best_total, attempts: b.attempts }]))
  const s = statsRes.data
  const avgTotal = numOrNull(s?.avg_total)
  const stats = {
    casesDone: s?.cases_done ?? 0,
    avgTotal,
    points: s?.points ?? 0,
    bossBest: s?.boss_best ?? null,
    bossDone: s?.boss_done ?? false,
    streakDays: effectiveStreak(s?.streak_days ?? 0, s?.last_active_day ?? null, todayParis()),
    activeDays: s?.active_days ?? 0,
    lastSessionAt: s?.last_session_at ?? null,
  }

  // Progression par module : les cas HORS boss (le boss se lit à part — verrou + meilleur essai).
  const nonBoss = allCases.filter((c) => c.kind !== 'boss')
  const meModules: MeModule[] = modules.flatMap((m) => {
    const cases = nonBoss.filter((c) => c.moduleId === m.id)
    if (cases.length === 0) return []
    return [{
      id: m.id,
      code: m.code,
      title: m.title,
      emoji: m.emoji,
      progress: moduleProgress(cases, bests),
      cases: cases.map((c) => {
        const best = bests.get(c.id) ?? null
        return { id: c.id, title: c.title, kind: c.kind, best: best?.bestTotal ?? null, medal: medalFor(best?.bestTotal), attempts: best?.attempts ?? 0 }
      }),
    }]
  })

  const sessions: MeSession[] = (sessionsRes.data ?? []).map((row) => {
    // Titre du cas depuis le SNAPSHOT (pas de jointure) : il dit ce qui a été joué ce jour-là,
    // même si le cas a été renommé ou désactivé depuis.
    const snap = row.case_snapshot as unknown as CaseSnapshot
    return {
      id: row.id,
      caseId: row.case_id,
      caseTitle: snap?.title ?? 'Cas',
      kind: row.kind as CaseKind,
      status: row.status,
      total: row.total,
      objectiveReached: row.objective_reached,
      startedAt: row.started_at,
      moduleTitle: snap?.moduleTitle ?? '',
    }
  })

  const ranking: RankRow[] = (rankRes.data ?? []).map((r) => ({
    profileId: r.profile_id,
    displayName: r.display_name,
    points: r.points,
    casesDone: r.cases_done,
    avgTotal: numOrNull(r.avg_total),
    bossDone: r.boss_done,
    streakDays: r.streak_days,
    isNew: r.is_new,
  }))
  const rankIndex = ranking.findIndex((r) => r.profileId === profileId)

  // « Reprendre où j'en étais » (spec §6) : 1er cas non validé (aucun meilleur résultat) du 1er
  // module incomplet — modules dans l'ordre du catalogue, cas dans l'ordre du module. null quand
  // tout est validé (ou quand le catalogue est vide) : l'en-tête n'affiche alors pas le bouton.
  const nextCaseId: string | null =
    meModules.find((m) => m.progress.total > 0 && m.progress.done < m.progress.total)?.cases.find((c) => c.best == null)?.id ?? null

  const totalCases = nonBoss.length
  const goldCount = nonBoss.filter((c) => (bests.get(c.id)?.bestTotal ?? 0) >= MEDAL_OR).length
  // Dénominateur AFFICHÉ : `cases_done` (stats DB, source des chiffres de l'en-tête et du
  // classement) compte TOUS les cas validés un jour, y compris ceux désactivés depuis par un
  // admin — alors que `totalCases` ne compte que le catalogue actif. Sans ce clamp, l'en-tête
  // pourrait afficher « 85/84 ». On garde `totalCases` brut pour `allDone` (sinon le trophée
  // « tout le catalogue » tomberait dès le premier cas validé).
  return {
    stats,
    modules: meModules,
    active: sessions.find((x) => x.status === 'active') ?? null,
    nextCaseId,
    history: sessions,
    trophies: computeTrophies({
      casesDone: stats.casesDone,
      streakDays: stats.streakDays,
      goldCount,
      modulesComplete: meModules.filter((m) => m.progress.total > 0 && m.progress.done === m.progress.total).length,
      allDone: totalCases > 0 && stats.casesDone >= totalCases,
      bossDone: stats.bossDone,
    }),
    ranking,
    myRank: rankIndex >= 0 ? rankIndex + 1 : null,
    totalCases: Math.max(totalCases, stats.casesDone),
    goldCount,
    bossUnlocked: bossUnlocked(avgTotal),
  }
}
