/**
 * Règles de la formation (transposées de Good Luck Agency) — PURES, testées, partagées par
 * apps/web (Ma formation, résultat, Overview). Les agrégats eux-mêmes (bests, stats) sont
 * calculés en base (0118) ; ici : ce qu'on en déduit pour l'affichage.
 */
export const MEDAL_OR = 85
export const MEDAL_ARGENT = 75
export const MEDAL_BRONZE = 60
export const BOSS_UNLOCK_AVG = 60
/** Boss réussi (spec §4) : note ≥ 60 — par fan ET pour la session (moyenne des fans). */
export const BOSS_PASS = 60
/**
 * « Plafond » GLA : objectif du cas non atteint ⇒ la note globale est plafonnée à 65, même si les
 * axes semblent propres. Vit ici (et non dans `lib/ai`) parce que DEUX prompts l'énoncent en prose
 * au modèle (`lib/ai/prompts.ts`, `lib/ai/schema.ts`) et que la notation l'applique ensuite côté
 * serveur : trois endroits qui doivent bouger ensemble.
 */
export const OBJECTIVE_CAP = 65

export type Medal = 'or' | 'argent' | 'bronze'

/** GLA medalFor : Or ≥ 85, Argent ≥ 75, Bronze ≥ 60, sinon « À valider » (null). */
export function medalFor(total: number | null | undefined): Medal | null {
  if (total == null) return null
  if (total >= MEDAL_OR) return 'or'
  if (total >= MEDAL_ARGENT) return 'argent'
  if (total >= MEDAL_BRONZE) return 'bronze'
  return null
}

/** Le boss final se débloque à 60/100 de moyenne sur les meilleurs totaux (hors boss). */
export const bossUnlocked = (avgTotal: number | null | undefined): boolean => avgTotal != null && avgTotal >= BOSS_UNLOCK_AVG

export type ModuleProgress = { total: number; done: number; pct: number; avg: number | null; points: number }

/** Progression d'un module depuis les meilleurs totaux par cas (GLA formation_progress : pct, avg, points = Σ). */
export function moduleProgress(cases: { id: string; kind: string }[], bests: Map<string, { bestTotal: number }>): ModuleProgress {
  const totals = cases.flatMap((c) => (bests.has(c.id) ? [bests.get(c.id)!.bestTotal] : []))
  const done = totals.length
  const points = totals.reduce((n, t) => n + t, 0)
  return {
    total: cases.length,
    done,
    pct: cases.length ? Math.round((done * 100) / cases.length) : 0,
    avg: done ? Math.round(points / done) : null,
    points,
  }
}

export type TrophyInput = { casesDone: number; streakDays: number; goldCount: number; modulesComplete: number; allDone: boolean; bossDone: boolean }
export type Trophy = { key: string; label: string; description: string; earned: boolean }

/** Jalons GLA (trophées), dans l'ordre d'affichage. */
export const TROPHIES: { key: string; label: string; description: string; test: (i: TrophyInput) => boolean }[] = [
  { key: 'first_case', label: 'Premier pas', description: 'Un premier cas validé', test: (i) => i.casesDone >= 1 },
  { key: 'streak_3', label: '3 jours d’affilée', description: 'Une notation 3 jours de suite', test: (i) => i.streakDays >= 3 },
  { key: 'streak_7', label: '7 jours d’affilée', description: 'Une notation 7 jours de suite', test: (i) => i.streakDays >= 7 },
  { key: 'gold_5', label: '5 Or', description: 'Cinq cas à 85 ou plus', test: (i) => i.goldCount >= 5 },
  { key: 'gold_15', label: '15 Or', description: 'Quinze cas à 85 ou plus', test: (i) => i.goldCount >= 15 },
  { key: 'module_complete', label: 'Module complet', description: 'Tous les cas d’un module validés', test: (i) => i.modulesComplete >= 1 },
  { key: 'all_done', label: 'Tout le catalogue', description: 'Tous les cas validés', test: (i) => i.allDone },
  { key: 'boss', label: 'Boss final', description: 'Le boss final réussi', test: (i) => i.bossDone },
]

export function computeTrophies(input: TrophyInput): Trophy[] {
  return TROPHIES.map(({ key, label, description, test }) => ({ key, label, description, earned: test(input) }))
}

/**
 * Streak « effectif » : la colonne `training_profile_stats.streak_days` vaut la série au DERNIER jour actif
 * et ne se périme pas toute seule. Elle ne compte que si le dernier jour actif est aujourd'hui ou hier
 * (jours civils Europe/Paris, passés en 'YYYY-MM-DD') ; sinon 0. Même règle que les RPC SQL (0119).
 */
export function effectiveStreak(streakDays: number, lastActiveDay: string | null, todayParis: string): number {
  if (!lastActiveDay || streakDays <= 0) return 0
  const last = Date.UTC(+lastActiveDay.slice(0, 4), +lastActiveDay.slice(5, 7) - 1, +lastActiveDay.slice(8, 10))
  const today = Date.UTC(+todayParis.slice(0, 4), +todayParis.slice(5, 7) - 1, +todayParis.slice(8, 10))
  const diffDays = Math.round((today - last) / 86_400_000)
  return diffDays <= 1 ? streakDays : 0
}
