import { createClient } from '@/lib/supabase/server'
import type { ModuleSummary } from '../types'

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
