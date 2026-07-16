import { createClient } from '@/lib/supabase/server'
import type { Member, MembersData } from '../types'

/**
 * Liste des membres + modèles assignables (page admin OU manager). La RLS filtre par
 * appelant (0054) : admin = tout, manager = lui-même + son équipe (manager_id) ;
 * `creators` reste scopé aux modèles du manager — le périmètre qu'il peut assigner.
 */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const [{ data: profiles }, { data: links }, { data: creators }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, display_name, role, pages, work_link, manager_id, created_at')
      .order('created_at'),
    supabase.from('profile_creators').select('profile_id, creator_id'),
    // TOUS les comptes (privés inclus) : `excluded` ne concerne que les calculs (LTV,
    // quotas), pas le droit d'accès — on doit pouvoir assigner « Carla (privé) ».
    supabase.from('creators').select('id, name').order('name'),
  ])
  const byProfile = new Map<string, string[]>()
  for (const l of links ?? []) {
    const arr = byProfile.get(l.profile_id)
    if (arr) arr.push(l.creator_id)
    else byProfile.set(l.profile_id, [l.creator_id])
  }
  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email ?? '—',
    displayName: p.display_name ?? (p.email ?? '').split('@')[0] ?? '—',
    role:
      p.role === 'superadmin'
        ? 'superadmin'
        : p.role === 'admin'
          ? 'admin'
          : p.role === 'manager'
            ? 'manager'
            : 'user',
    pages: p.pages ?? [],
    creatorIds: byProfile.get(p.id) ?? [],
    managerId: p.manager_id ?? '',
    workLink: p.work_link ?? '',
    createdAt: p.created_at,
  }))
  return { members, creators: creators ?? [] }
}
