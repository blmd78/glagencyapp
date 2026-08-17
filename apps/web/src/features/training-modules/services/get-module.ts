import { createClient } from '@/lib/supabase/server'
import type { CaseKind } from '@/lib/types/training'
import type { ModuleDetail } from '../types'

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
