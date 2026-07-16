import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { PageSlug } from '@/config/workspaces'

/**
 * Utilisateur courant (ou null) — valide le JWT côté serveur via getClaims() : validation
 * LOCALE de la signature (clés ES256 du projet, JWKS mis en cache), pas d'aller-retour
 * réseau vers Supabase Auth à chaque page (ce que faisait auth.getUser()).
 * `cache()` : mémoïsé PAR REQUÊTE (layout + garde de page appellent tous deux getProfile →
 * sans ça, 2 validations JWT + 2 SELECT profiles par affichage).
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null }
})

/** Garde : redirige vers /login si pas de session. */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

export interface Profile {
  id: string
  /** `superadmin` en base est mappé sur 'admin' ici (il hérite de tout) — cf. `superadmin`. */
  role: 'admin' | 'user'
  /** Propriétaire (rôle base `superadmin`) : seul à pouvoir gérer les membres/rôles. */
  superadmin: boolean
  /** Rôle base `manager` : accès page Membres (ajout de chatters) — `user` partout ailleurs. */
  manager: boolean
  /** Slugs des pages autorisées (vide pour un admin = tout). */
  pages: string[]
  displayName: string | null
  email: string | null
  /** Lien « outil de travail » posé par l'admin (Membres) — '' = aucun. */
  workLink: string
}

/** Profil applicatif de l'utilisateur courant (RLS : chacun lit le sien), ou null. Mémoïsé par requête. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, pages, display_name, email, work_link')
    .eq('id', user.id)
    .single()
  if (!data) return null
  return {
    id: data.id,
    role: data.role === 'admin' || data.role === 'superadmin' ? 'admin' : 'user',
    superadmin: data.role === 'superadmin',
    manager: data.role === 'manager',
    pages: data.pages ?? [],
    displayName: data.display_name,
    email: data.email ?? user.email ?? null,
    workLink: data.work_link ?? '',
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

/** Garde admin (superadmin compris — il hérite de tout). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/chatter/overview')
  return profile
}

/** Garde page Membres : admin (superadmin compris) OU manager. */
export async function requireAdminOrManager(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && !profile.manager) redirect('/chatter/overview')
  return profile
}

/** Garde SUPERADMIN (gestion des membres/rôles — réservée aux propriétaires). */
export async function requireSuperadmin(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!profile.superadmin) redirect('/chatter/overview')
  return profile
}
