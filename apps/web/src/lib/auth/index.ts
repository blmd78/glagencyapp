import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Utilisateur courant (ou null) — valide le JWT côté serveur. */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Garde : redirige vers /login si pas de session. */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

export interface Profile {
  id: string
  role: 'admin' | 'user'
  /** Slugs des pages autorisées (vide pour un admin = tout). */
  pages: string[]
  displayName: string | null
  email: string | null
}

/** Profil applicatif de l'utilisateur courant (RLS : chacun lit le sien), ou null. */
export async function getProfile(): Promise<Profile | null> {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, pages, display_name, email')
    .eq('id', user.id)
    .single()
  if (!data) return null
  return {
    id: data.id,
    role: data.role === 'admin' ? 'admin' : 'user',
    pages: data.pages ?? [],
    displayName: data.display_name,
    email: data.email ?? user.email ?? null,
  }
}

/** Garde de page : admin passe toujours ; `user` doit avoir le slug dans profiles.pages. */
export async function requireAccess(slug: string): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && !profile.pages.includes(slug)) {
    redirect(profile.pages[0] ? `/chatter/${profile.pages[0]}` : '/login')
  }
  return profile
}

/** Garde admin (page Membres, actions sensibles). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/chatter/overview')
  return profile
}
