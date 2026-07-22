import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import type { CrmRole, CrmTeam } from '@/lib/types/chatters'
import type { Member, MembersData } from '../types'

/**
 * Liste des membres + modèles assignables (page admin OU manager). La RLS filtre par
 * appelant (0054) : admin = tout, manager = lui-même + son équipe (manager_id) ;
 * `creators` reste scopé aux modèles du manager — le périmètre qu'il peut assigner.
 * `chatters` (options du lien MyPuls, client admin agence-wide) n'est chargé QUE pour un
 * admin : le champ lien est admin-only (UI + serveur) et un manager ne doit pas recevoir
 * cette liste hors de son périmètre RLS dans son payload.
 */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const admin = createAdminClient()
  // Le lien chatteur est admin-only → on ne requête/expose la liste agence-wide des chatteurs QUE
  // pour un admin (getProfile est caché : déjà appelé par requireAdminOrManager dans le même rendu).
  const isAdmin = (await getProfile())?.role === 'admin'
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
    isAdmin
      ? admin.from('chatters').select('id, display_name').order('display_name')
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
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
