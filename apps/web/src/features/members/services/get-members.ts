import { createClient } from '@/lib/supabase/server'
import type { Member, MembersData } from '../types'

/** Liste des membres + modèles assignables (page admin — la RLS laisse l'admin tout lire). */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const [{ data: profiles }, { data: links }, { data: creators }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, display_name, role, pages, created_at')
      .order('created_at'),
    supabase.from('profile_creators').select('profile_id, creator_id'),
    // TOUS les comptes (privés inclus) : `excluded` ne concerne que les calculs (LTV,
    // quotas), pas le droit d'accès — on doit pouvoir assigner « Carla (privé) ».
    supabase.from('creators').select('id, name').order('name'),
  ])
  const byProfile = new Map<string, string[]>()
  for (const l of links ?? []) {
    byProfile.set(l.profile_id, [...(byProfile.get(l.profile_id) ?? []), l.creator_id])
  }
  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email ?? '—',
    displayName: p.display_name ?? (p.email ?? '').split('@')[0] ?? '—',
    role: p.role === 'admin' ? 'admin' : 'user',
    pages: p.pages ?? [],
    creatorIds: byProfile.get(p.id) ?? [],
    createdAt: p.created_at,
  }))
  return { members, creators: creators ?? [] }
}
