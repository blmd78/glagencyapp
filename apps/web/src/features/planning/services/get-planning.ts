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
 * Personnes dont on peut ouvrir le planning via le sélecteur (SOI est ajouté en amont, cf.
 * page.tsx). Filtré par rôle du viewer — jamais de chatteur, jamais de superadmin :
 * - superadmin → admins + managers + sous-managers
 * - admin      → managers + sous-managers (pas les autres admins)
 * - manager    → ses sous-managers directs (la RLS profiles limite déjà à manager_id = lui)
 * - sous-manager / chatteur → personne (ils ne voient que le leur)
 */
export async function getPlanningMembers(role: Profile['baseRole']): Promise<PlanningMember[]> {
  const roles =
    role === 'superadmin'
      ? ['admin', 'manager', 'sous-manager']
      : role === 'admin'
        ? ['manager', 'sous-manager']
        : role === 'manager'
          ? ['sous-manager']
          : []
  if (roles.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, role')
    .in('role', roles)
    .order('role')
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? '—',
    role: p.role,
  }))
}
