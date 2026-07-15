import { createClient } from '@/lib/supabase/server'
import type { PlanningBlock, PlanningData, PlanningMember, PlanningSection } from '../types'

const SECTION_ORDER: Record<PlanningSection, number> = { matin: 0, apres_midi: 1, soir: 2 }

/**
 * Planning d'UN membre — le RLS fait le cloisonnement (un membre ne lit que le sien,
 * l'admin tout). `exists: false` si aucun planning n'a encore été créé pour lui.
 */
export async function getPlanning(profileId: string): Promise<PlanningData> {
  const supabase = await createClient()
  const [{ data: profile }, { data: planning }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email').eq('id', profileId).maybeSingle(),
    supabase.from('plannings').select('*').eq('profile_id', profileId).maybeSingle(),
  ])
  const profileName = profile?.display_name ?? profile?.email ?? '—'

  if (!planning) {
    return {
      profileId,
      profileName,
      exists: false,
      priorityTitle: '',
      priorityBody: '',
      priorityForbidden: '',
      priorityAllowed: '',
      pauseNote: '',
      annexes: [],
      annexNote: '',
      blocks: [],
    }
  }

  const { data: blocks } = await supabase
    .from('planning_blocks')
    .select('*')
    .eq('planning_id', planning.id)
    .order('position')

  const rows: PlanningBlock[] = (blocks ?? [])
    .map((b) => ({
      id: b.id,
      section: b.section as PlanningSection,
      position: b.position,
      timeStart: b.time_start,
      timeEnd: b.time_end,
      title: b.title,
      badge: b.badge,
      color: b.color,
      bullets: Array.isArray(b.bullets) ? (b.bullets as string[]) : [],
    }))
    // Tri stable : section puis heure de début (la position départage les égalités).
    .sort(
      (a, b) =>
        SECTION_ORDER[a.section] - SECTION_ORDER[b.section] ||
        a.timeStart.localeCompare(b.timeStart) ||
        a.position - b.position,
    )

  return {
    profileId,
    profileName,
    exists: true,
    priorityTitle: planning.priority_title,
    priorityBody: planning.priority_body,
    priorityForbidden: planning.priority_forbidden,
    priorityAllowed: planning.priority_allowed,
    pauseNote: planning.pause_note,
    annexes: Array.isArray(planning.annexes)
      ? (planning.annexes as { title: string; detail: string }[])
      : [],
    annexNote: planning.annex_note,
    blocks: rows,
  }
}

/**
 * Membres pouvant recevoir un planning (sélecteur admin) — managers d'abord.
 * Un ADMIN ne planifie que les membres ; un SUPERADMIN voit aussi les admins (il peut
 * leur faire un planning). Les superadmins ne sont jamais dans le sélecteur.
 */
export async function getPlanningMembers(includeAdmins: boolean): Promise<PlanningMember[]> {
  const supabase = await createClient()
  const excluded = includeAdmins ? ['superadmin'] : ['superadmin', 'admin']
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, email, role')
    .not('role', 'in', `(${excluded.join(',')})`)
    .order('role')
    .order('display_name')
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? '—',
    role: p.role,
  }))
}
