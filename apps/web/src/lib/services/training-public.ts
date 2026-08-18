import { createClient } from '@/lib/supabase/server'
import type { CaseKind } from '@/lib/types/training'
import type { ModuleDetail, ModuleSummary, PublicCaseRef } from '@/lib/types/training-public'

/** Modules ACTIFS, ordonnés, avec leur nombre de cas actifs (table de référence — select simple). */
export async function getModules(): Promise<ModuleSummary[]> {
  const supabase = await createClient()
  const [mods, cases] = await Promise.all([
    supabase.from('training_modules').select('id, code, title, emoji, description, course_md').eq('active', true).order('position'),
    supabase.from('training_cases').select('module_id').eq('active', true),
  ])
  if (mods.error) throw new Error(mods.error.message)
  if (cases.error) throw new Error(cases.error.message)
  const counts = new Map<string, number>()
  for (const c of cases.data ?? []) counts.set(c.module_id, (counts.get(c.module_id) ?? 0) + 1)
  return (mods.data ?? []).map((m) => ({
    id: m.id,
    code: m.code,
    title: m.title,
    emoji: m.emoji,
    description: m.description,
    caseCount: counts.get(m.id) ?? 0,
    hasCourse: !!m.course_md,
  }))
}

/**
 * Modules ACTIFS, ordonnés, RÉDUITS à leur identité (id, code, titre, emoji) — pour « Ma
 * formation », qui n'affiche que des cartes de progression. `getModules()` rapatriait `course_md`
 * (jusqu'à 50 000 caractères par module) pour n'en garder qu'un booléen : inutile ici.
 */
export async function getModuleRefs(): Promise<{ id: string; code: string; title: string; emoji: string | null }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('training_modules').select('id, code, title, emoji').eq('active', true).order('position')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Un module ACTIF par code, avec ses axes, sections et cas actifs en PROJECTION PUBLIQUE :
 * colonnes visibles uniquement (jamais fan_brief / expected / scoring_notes ni les champs cachés
 * des fans du boss — un RSC les enverrait au navigateur du chatter). null = inconnu ou inactif.
 */
export async function getModule(code: string): Promise<ModuleDetail | null> {
  const supabase = await createClient()
  const { data: m, error } = await supabase
    .from('training_modules')
    // Un seul littéral (pas de concaténation `+`) : `+` entre littéraux s'élargit en `string`
    // (règle TS), et supabase-js a besoin du type littéral exact pour typer l'embed.
    .select(
      'id, code, title, emoji, description, objective_label, course_md, training_module_axes(key, name, description, position), training_module_sections(id, title, emoji, description, position)',
    )
    .eq('code', code)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!m) return null

  const { data: cases, error: cErr } = await supabase
    .from('training_cases')
    .select(
      'id, code, kind, title, phase, difficulty, max_turns, reaction_max_s, is_sale, section_id, position, training_case_boss_fans(id, name, age, job, city, color, persona, position)',
    )
    .eq('module_id', m.id)
    .eq('active', true)
    .order('position')
  if (cErr) throw new Error(cErr.message)
  const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position)

  return {
    id: m.id,
    code: m.code,
    title: m.title,
    emoji: m.emoji,
    description: m.description,
    objectiveLabel: m.objective_label,
    courseMd: m.course_md,
    axes: byPosition(m.training_module_axes).map((a) => ({ key: a.key, name: a.name, description: a.description })),
    sections: byPosition(m.training_module_sections).map((s) => ({ id: s.id, title: s.title, emoji: s.emoji, description: s.description })),
    cases: (cases ?? []).map((c) => ({
      id: c.id,
      code: c.code,
      kind: c.kind as CaseKind,
      title: c.title,
      phase: c.phase,
      difficulty: c.difficulty,
      maxTurns: c.max_turns,
      reactionMaxS: c.reaction_max_s,
      isSale: c.is_sale,
      sectionId: c.section_id,
      position: c.position,
      bossFans: byPosition(c.training_case_boss_fans).map((f) => ({
        id: f.id, name: f.name, age: f.age, job: f.job, city: f.city, color: f.color, persona: f.persona,
      })),
    })),
  }
}

/** Tous les cas actifs (id, module_id, kind, title, code du module) — pour la progression par module (Ma formation). */
export async function getAllCases(): Promise<PublicCaseRef[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('training_cases').select('id, module_id, kind, title, section_id, training_modules!inner(active)').eq('active', true).eq('training_modules.active', true).order('position')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({ id: c.id, moduleId: c.module_id, kind: c.kind as CaseKind, title: c.title, sectionId: c.section_id }))
}
