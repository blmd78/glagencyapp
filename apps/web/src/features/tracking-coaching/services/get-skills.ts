import { createClient } from '@/lib/supabase/server'
import type { SkillLine } from '../components/skills-admin'

/** La grille de compétences active, dans l'ordre d'affichage. */
export async function getSkills(): Promise<SkillLine[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracker_skills')
    .select('id, name, description')
    .eq('active', true)
    .order('position')
  if (error) throw new Error(error.message)
  return data ?? []
}
