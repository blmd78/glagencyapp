import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { CrmRole, CrmTeam } from '@/lib/types/chatters'
import type { Member, MembersData } from '../types'

/**
 * Liste des membres + modèles assignables (page admin OU manager). La RLS filtre par
 * appelant (0054) : admin = tout, manager = lui-même + son équipe (manager_id) ;
 * `creators` reste scopé aux modèles du manager — le périmètre qu'il peut assigner.
 * `chatters` (options du lien MyPuls) est lu en client admin : agence-wide, indépendant
 * du périmètre RLS de l'appelant (le champ lui-même reste réservé superadmin côté UI).
 */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const [
    { data: profiles, error: profilesErr },
    { data: links, error: linksErr },
    { data: creators, error: creatorsErr },
    { data: chattersData, error: chattersErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, display_name, role, pages, work_link, manager_id, closing_role, closing_team, chatter_id, created_at',
      )
      .order('created_at'),
    supabase.from('profile_creators').select('profile_id, creator_id'),
    // TOUS les comptes (privés inclus) : `excluded` ne concerne que les calculs (LTV,
    // quotas), pas le droit d'accès — on doit pouvoir assigner « Carla (privé) ».
    supabase.from('creators').select('id, name').order('name'),
    admin.from('chatters').select('id, display_name').order('display_name'),
  ])
  if (profilesErr) throw new Error(profilesErr.message)
  if (linksErr) throw new Error(linksErr.message)
  if (creatorsErr) throw new Error(creatorsErr.message)
  if (chattersErr) throw new Error(chattersErr.message)
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
            : p.role === 'sous-manager'
              ? 'sous-manager'
              : p.role === 'police'
                ? 'police'
                : 'chatteur',
    pages: p.pages ?? [],
    creatorIds: byProfile.get(p.id) ?? [],
    managerId: p.manager_id ?? '',
    workLink: p.work_link ?? '',
    closingRole: (p.closing_role ?? null) as CrmRole | null,
    closingTeam: (p.closing_team ?? null) as CrmTeam | null,
    chatterId: p.chatter_id ?? '',
    createdAt: p.created_at,
  }))
  const chatters = (chattersData ?? [])
    .filter((c) => c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name as string }))
  return { members, creators: creators ?? [], chatters }
}
