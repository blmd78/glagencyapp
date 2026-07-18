import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { landingHref, type PageSlug } from '@/config/workspaces'

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
  role: 'admin' | 'chatteur'
  /** Rôle EXACT en base (non écrasé) — pour les rares cas qui distinguent manager de sous-manager (ex. planning). */
  baseRole: 'superadmin' | 'admin' | 'manager' | 'sous-manager' | 'chatteur'
  /** Propriétaire (rôle base `superadmin`) : seul à pouvoir gérer les membres/rôles. */
  superadmin: boolean
  /** Rôle base `manager` OU `sous-manager` : accès page Membres (ajout de chatteurs) — `chatteur` partout ailleurs. */
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
  const raw = data.role
  const baseRole: Profile['baseRole'] =
    raw === 'superadmin' || raw === 'admin' || raw === 'manager' || raw === 'sous-manager'
      ? raw
      : 'chatteur' // 'user' transitoire (0059) et toute valeur inconnue → chatteur
  return {
    id: data.id,
    role: data.role === 'admin' || data.role === 'superadmin' ? 'admin' : 'chatteur',
    baseRole,
    superadmin: data.role === 'superadmin',
    manager: data.role === 'manager' || data.role === 'sous-manager',
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
    // Repli sur la 1ʳᵉ page RÉELLE du profil. landingHref résout le slug → vraie route :
    // un `/chatter/<slug>` naïf 404ait sur crm-spenders / mkt-* / dashboard (LE bug 404).
    redirect(landingHref(profile))
  }
  return profile
}

/** Garde admin (superadmin compris — il hérite de tout). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(landingHref(profile))
  return profile
}

/** Garde page Membres : admin (superadmin compris) OU manager. */
export async function requireAdminOrManager(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && !profile.manager) redirect(landingHref(profile))
  return profile
}

/** Garde SUPERADMIN (gestion des membres/rôles — réservée aux propriétaires). */
export async function requireSuperadmin(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!profile.superadmin) redirect(landingHref(profile))
  return profile
}

/** Prédicat « admin OU page autorisée » — partagé par les gardes d'actions (LECTURE). */
export function hasPageAccess(profile: Profile | null, slug: PageSlug): profile is Profile {
  return !!profile && (profile.role === 'admin' || profile.pages.includes(slug))
}

/**
 * Prédicat « ÉCRITURE d'une page » — admin, OU manager/sous-manager ayant la page. Miroir
 * applicatif de la fonction SQL `can_write_page()` (0060) : un chatteur (has_page vrai mais
 * ni admin ni manager) est EXCLU → lecture seule. Défense en profondeur ; la RLS reste le
 * verrou réel. `manager` couvre déjà manager ET sous-manager (cf. getProfile).
 */
export function hasWriteAccess(profile: Profile | null, slug: PageSlug): profile is Profile {
  return !!profile && (profile.role === 'admin' || (profile.manager && profile.pages.includes(slug)))
}
