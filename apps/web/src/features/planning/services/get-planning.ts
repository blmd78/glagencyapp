import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import type { PlanningBlock, PlanningData, PlanningMember, PlanningSection } from '../types'

const SECTION_ORDER: Record<PlanningSection, number> = { matin: 0, apres_midi: 1, soir: 2 }

/**
 * Planning d'UN membre — le RLS fait le cloisonnement (un membre ne lit que le sien,
 * l'admin tout). `exists: false` si aucun planning n'a encore été créé pour lui.
 */
export async function getPlanning(profileId: string): Promise<PlanningData> {
  const supabase = await createClient()
  const [
    { data: profile, error: profileErr },
    { data: planning, error: planningErr },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email').eq('id', profileId).maybeSingle(),
    supabase.from('plannings').select('*').eq('profile_id', profileId).maybeSingle(),
  ])
  if (profileErr) throw new Error(profileErr.message)
  if (planningErr) throw new Error(planningErr.message)
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

  const { data: blocks, error: blocksErr } = await supabase
    .from('planning_blocks')
    .select('*')
    .eq('planning_id', planning.id)
    .order('position')
  if (blocksErr) throw new Error(blocksErr.message)

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
 * Personnes sélectionnables dans l'en-tête (planning ET to-do). Filtré par rôle du viewer —
 * jamais de chatteur ; les SUPERADMINS ne sont visibles que d'un superadmin (la RLS 0061
 * l'autorisait déjà : un superadmin édite n'importe quelle cible, lui-même compris).
 * superadmin → superadmins + admins + managers + sous-managers ; admin → managers +
 * sous-managers ; manager → ses sous-managers directs (RLS `profiles`) ; sinon personne.
 */
export async function getPlanningMembers(role: Profile['baseRole']): Promise<PlanningMember[]> {
  // Qui peut être sélectionné, par rôle du spectateur. Les SUPERADMINS ne sont visibles que
  // d'un superadmin (la RLS 0061 l'autorisait déjà : la restriction était purement ici).
  const roles =
    role === 'superadmin'
      ? ['superadmin', 'admin', 'manager', 'sous-manager']
      : role === 'admin'
        ? ['manager', 'sous-manager']
        : role === 'manager'
          ? ['sous-manager']
          : []
  if (!roles.length) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, role, pages')
    .in('role', roles)
    .order('role')
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? '—',
    role: p.role,
    // admin/superadmin passent requireAccess sans slug (lib/auth) ; les autres ont besoin
    // du slug 'planning' pour ouvrir la page — et donc pour voir leur to-do.
    hasPlanningPage:
      p.role === 'admin' || p.role === 'superadmin' || (p.pages ?? []).includes('planning'),
  }))
}
