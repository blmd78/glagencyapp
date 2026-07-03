import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { PageSlug } from '@/config/workspaces'

/**
 * Utilisateur courant (ou null) — valide le JWT côté serveur.
 * `cache()` : mémoïsé PAR REQUÊTE (layout + garde de page appellent tous deux getProfile →
 * sans ça, 2 validations JWT + 2 SELECT profiles par affichage).
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

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

/** Profil applicatif de l'utilisateur courant (RLS : chacun lit le sien), ou null. Mémoïsé par requête. */
export const getProfile = cache(async (): Promise<Profile | null> => {
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
})

/**
 * Garde de page : admin passe toujours ; `user` doit avoir le slug dans profiles.pages.
 * Sans aucune page → /no-access (PAS /login : l'utilisateur est authentifié, le renvoyer
 * au login créerait un rebond infini login ↔ overview).
 */
export async function requireAccess(slug: PageSlug): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && !profile.pages.includes(slug)) {
    redirect(profile.pages[0] ? `/chatter/${profile.pages[0]}` : '/no-access')
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
