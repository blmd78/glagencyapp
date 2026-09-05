import { createClient } from '@/lib/supabase/server'
import { CASE_KIND_LABELS, type CaseKind } from '@/lib/types/training'
import type { CaseGroup, CaseProgress, ChatterDetail, ModuleProgress } from '../types'

/** `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number(). */
const num = (v: number | string): number => Number(v)

/**
 * Titre du groupe des cas SANS compétence dans un module qui en a. Une seule sorte présente (le
 * cas réel : le défi simultané) → son libellé ; plusieurs → un intitulé neutre, jamais faux.
 */
function orphanTitle(rows: { kind: CaseKind }[]): string {
  const kinds = new Set(rows.map((r) => r.kind))
  return kinds.size === 1 ? CASE_KIND_LABELS[[...kinds][0]] : 'Hors compétence'
}

/**
 * Fiche d'un chatter pour l'encadrant, en 4 lectures parallèles (client utilisateur = RLS —
 * `training_case_bests` / `training_sessions` ouvrent la lecture à `has_page('frm-suivi')`,
 * 0117/0118 ; un appelant sans le droit lit 0 ligne).
 *
 * `training_axis_profile` est `security invoker` : elle voit ce que l'appelant voit, donc les
 * moyennes par axe d'un chatter ne sortent que pour un encadrant. Elle exclut le boss (barème
 * différent, /100 par étape) et rend déjà les axes du plus faible au plus fort.
 *
 * Pas de `displayName` ici : il vient du roster côté Template (cf. `ChatterDetail`).
 *
 * LE CATALOGUE EST LU EN ENTIER (4ᵉ requête) et non déduit des seules notes : sans lui, un cas
 * jamais tenté n'existe pas, et c'est précisément ce que l'encadrant cherche — le trou dans le
 * parcours, pas la liste de ce qui a été fait. 7 modules, ~10 compétences et ~85 cas actifs : le
 * volume est négligeable devant les 50 sessions déjà chargées à côté.
 *
 * COLONNES PUBLIQUES SEULEMENT (`title`, `kind`, `difficulty`, `position`, les deux clés) : ni
 * `context` ni `objective`, qui décrivent la consigne du cas. La règle de la face — jamais de
 * `fan_brief`/`expected` côté lecture — vaut aussi pour un encadrant, dont ce n'est pas l'écran.
 */
export async function getChatter(profileId: string): Promise<ChatterDetail> {
  const supabase = await createClient()
  const [bestsRes, sessionsRes, axesRes, catalogRes] = await Promise.all([
    supabase
      .from('training_case_bests')
      // Plus de jointure de titres : ils viennent du CATALOGUE, lu juste en dessous.
      .select('case_id, best_total, attempts, last_at')
      .eq('profile_id', profileId)
      .order('last_at', { ascending: false }),
    supabase
      .from('training_sessions')
      // Sous-champ du snapshot (`->>`), pas le jsonb entier — même raison que get-me (payload ×50).
      .select('id, kind, status, total, started_at, case_title:case_snapshot->>title')
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase.rpc('training_axis_profile', { p_profile: profileId }),
    // Le catalogue : modules actifs, leurs compétences et leurs cas actifs. RLS `*_read` — ouverte
    // à qui porte la face `formation`, ce qu'un encadrant Suivi a forcément.
    supabase
      .from('training_modules')
      .select('code, title, emoji, position, training_module_sections(id, title, position), training_cases(id, title, kind, difficulty, position, section_id, active)')
      .eq('active', true)
      .order('position'),
  ])
  if (bestsRes.error) throw new Error(bestsRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  if (axesRes.error) throw new Error(axesRes.error.message)
  if (catalogRes.error) throw new Error(catalogRes.error.message)

  // Les meilleures notes, indexées par cas — la fiche les CROISE avec le catalogue plutôt que de
  // les lister : un cas absent de cette table est un cas jamais tenté, pas un cas inexistant.
  const bestOf = new Map((bestsRes.data ?? []).map((b) => [b.case_id, b]))

  const modules: ModuleProgress[] = (catalogRes.data ?? []).map((m) => {
    const cases = (m.training_cases ?? []).filter((c) => c.active)
    const sections = [...(m.training_module_sections ?? [])].sort((a, b) => a.position - b.position)

    const toProgress = (c: (typeof cases)[number]): CaseProgress => {
      const b = bestOf.get(c.id)
      return {
        caseId: c.id,
        title: c.title,
        kind: c.kind as CaseKind,
        difficulty: c.difficulty,
        bestTotal: b?.best_total ?? null,
        attempts: b?.attempts ?? 0,
        lastAt: b?.last_at ?? null,
      }
    }
    // Par DIFFICULTÉ croissante, comme la page Modules côté chatter (`cases-list.tsx:16-18`) :
    // c'est ce qui donne le sentiment de progression, et ce qui fait voir où quelqu'un bute.
    const byDifficulty = (a: CaseProgress, b: CaseProgress) => a.difficulty - b.difficulty

    const group = (id: string | null, title: string, rows: CaseProgress[]): CaseGroup => {
      // Moyenne sur les cas TENTÉS seulement : compter un cas jamais joué comme 0 ferait dire à
      // cet écran qu'il a raté ce qu'il n'a pas encore vu.
      const scored = rows.filter((r) => r.bestTotal != null)
      return {
        id,
        title,
        avg: scored.length === 0 ? null : scored.reduce((sum, r) => sum + (r.bestTotal ?? 0), 0) / scored.length,
        attempted: scored.length,
        total: rows.length,
        cases: [...rows].sort(byDifficulty),
      }
    }

    const rows = cases.map(toProgress)
    const bySection = new Map(cases.map((c) => [c.id, c.section_id]))
    // Un module SANS compétence (Transitions, Relance spender…) rend un seul groupe à `id: null` :
    // la fiche saute alors un niveau de dépliage au lieu d'en montrer un vide.
    const groups: CaseGroup[] =
      sections.length === 0
        ? [group(null, m.title, rows)]
        : [
            ...sections.map((sec) => group(sec.id, sec.title, rows.filter((r) => bySection.get(r.caseId) === sec.id))),
            // Les cas d'un module à compétences qui n'appartiennent à AUCUNE : en pratique le
            // défi simultané des deux modules concernés (« 5 fans en setting en simultané »,
            // vérifié en base). Le groupe prend donc le nom de la SORTE quand elle est unique —
            // « Hors compétence » aurait été un intitulé de schéma, pas un titre lisible.
            group(null, orphanTitle(rows.filter((r) => !bySection.get(r.caseId))), rows.filter((r) => !bySection.get(r.caseId))),
          ].filter((g) => g.total > 0)

    const scored = rows.filter((r) => r.bestTotal != null)
    return {
      code: m.code,
      title: m.title,
      emoji: m.emoji,
      avg: scored.length === 0 ? null : scored.reduce((sum, r) => sum + (r.bestTotal ?? 0), 0) / scored.length,
      attempted: scored.length,
      total: rows.length,
      groups,
    }
  })

  return {
    profileId,
    modules,
    // Titre depuis le SNAPSHOT (pas de jointure) : il dit ce qui a été joué ce jour-là, même si
    // le cas a été renommé ou désactivé depuis. `?? 'Cas'` : `->>` est typé string mais vaut
    // null à l'exécution sur un snapshot dégénéré.
    sessions: (sessionsRes.data ?? []).map((s) => ({
      id: s.id,
      caseTitle: s.case_title ?? 'Cas',
      kind: s.kind as CaseKind,
      status: s.status,
      total: s.total,
      startedAt: s.started_at,
    })),
    axes: (axesRes.data ?? []).map((a) => ({
      key: a.axis_key,
      name: a.axis_name,
      avg: num(a.avg_score),
      n: a.n,
    })),
  }
}
