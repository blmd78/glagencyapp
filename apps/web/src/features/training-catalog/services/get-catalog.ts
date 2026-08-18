import type { Database } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { CaseKind, Speaker } from '@/lib/types/training'
import type { CatalogCase, CatalogData, CatalogModule } from '../types'

type T = Database['public']['Tables']
type ModuleRow = T['training_modules']['Row'] & {
  training_module_axes: T['training_module_axes']['Row'][]
  training_module_sections: T['training_module_sections']['Row'][]
  training_module_secrets: { scoring_notes: string | null } | null
}
type CaseRow = T['training_cases']['Row'] & {
  training_case_messages: T['training_case_messages']['Row'][]
  training_case_arena_slots: T['training_case_arena_slots']['Row'][]
  training_case_boss_fans: (T['training_case_boss_fans']['Row'] & {
    training_boss_fan_secrets: T['training_boss_fan_secrets']['Row'] | null
  })[]
  training_case_secrets: { fan_brief: string | null; expected: string | null } | null
}

/**
 * Catalogue COMPLET pour l'admin : tout (actif ou non), ordonné par position, en deux requêtes
 * (modules + axes + sections ; cas + messages + créneaux + fans) regroupées en mémoire. Table
 * de RÉFÉRENCE (~90 cas, ~230 messages), pas une table de faits journaliers : un `select`
 * simple suffit — `fetchAll` (guidelines-data-loading §2) ne s'impose qu'aux faits qui
 * dépassent le plafond PostgREST de 1000 lignes. RLS : lecture = droit de face `formation` / admin.
 */
export async function getCatalog(): Promise<CatalogData> {
  const supabase = await createClient()
  const [mods, cases] = await Promise.all([
    supabase
      .from('training_modules')
      .select('*, training_module_axes(*), training_module_sections(*), training_module_secrets(scoring_notes)')
      .order('position'),
    // `!case_id` : training_case_arena_slots a DEUX FK vers training_cases (case_id, ref_case_id) —
    // sans l'indice, PostgREST refuse l'embed (PGRST201, relation ambiguë). Les enfants sont triés
    // en JS (`byPosition`) plutôt que par `.order(…, { referencedTable })` : moins de surface. Les
    // secrets (RLS admin) sont joints ici — le Catalogue est admin ; la face lecture
    // (training-modules) ne les touche pas.
    supabase
      .from('training_cases')
      .select(
        '*, training_case_messages(*), training_case_arena_slots!case_id(*), training_case_boss_fans(*, training_boss_fan_secrets(*)), training_case_secrets(fan_brief, expected)',
      )
      .order('position'),
  ])
  if (mods.error) throw new Error(mods.error.message)
  if (cases.error) throw new Error(cases.error.message)

  const byModule = new Map<string, CatalogCase[]>()
  for (const c of cases.data ?? []) {
    const row = toCase(c)
    const list = byModule.get(row.moduleId) ?? []
    list.push(row)
    byModule.set(row.moduleId, list)
  }
  return { modules: (mods.data ?? []).map((m) => toModule(m, byModule.get(m.id) ?? [])) }
}

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position)

function toModule(m: ModuleRow, cases: CatalogCase[]): CatalogModule {
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    emoji: m.emoji,
    description: m.description,
    objectiveLabel: m.objective_label,
    courseMd: m.course_md,
    scoringNotes: m.training_module_secrets?.scoring_notes ?? null,
    position: m.position,
    active: m.active,
    axes: byPosition(m.training_module_axes).map((a) => ({ id: a.id, key: a.key, name: a.name, description: a.description, position: a.position })),
    sections: byPosition(m.training_module_sections).map((s) => ({
      id: s.id, code: s.code, title: s.title, emoji: s.emoji, description: s.description, position: s.position,
    })),
    cases,
  }
}

function toCase(c: CaseRow): CatalogCase {
  return {
    id: c.id,
    moduleId: c.module_id,
    sectionId: c.section_id,
    code: c.code,
    kind: c.kind as CaseKind,
    title: c.title,
    phase: c.phase,
    difficulty: c.difficulty,
    maxTurns: c.max_turns,
    reactionMaxS: c.reaction_max_s,
    isSale: c.is_sale,
    context: c.context,
    objective: c.objective,
    targetLine: c.target_line,
    fanName: c.fan_name,
    fanBrief: c.training_case_secrets?.fan_brief ?? null,
    expected: c.training_case_secrets?.expected ?? null,
    position: c.position,
    active: c.active,
    messages: byPosition(c.training_case_messages).map((m) => ({ id: m.id, position: m.position, speaker: m.speaker as Speaker, body: m.body })),
    arenaSlots: byPosition(c.training_case_arena_slots).map((s) => ({ id: s.id, position: s.position, refCaseId: s.ref_case_id, displayName: s.display_name })),
    bossFans: byPosition(c.training_case_boss_fans).map((f) => ({
      id: f.id, position: f.position, code: f.code, name: f.name, age: f.age, job: f.job, city: f.city, color: f.color,
      persona: f.persona, openingMessage: f.opening_message,
      budgetCap: f.training_boss_fan_secrets?.budget_cap ?? null,
      negoThreshold: f.training_boss_fan_secrets?.nego_threshold ?? null,
      negoWhere: f.training_boss_fan_secrets?.nego_where ?? null,
      meetWhen: f.training_boss_fan_secrets?.meet_when ?? null,
      meetWhere: f.training_boss_fan_secrets?.meet_where ?? null,
      derails: f.training_boss_fan_secrets?.derails ?? null,
    })),
  }
}
