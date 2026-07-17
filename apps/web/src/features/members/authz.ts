import { createAdminClient } from '@glagency/db'
import { isMarketingSlug } from '@/config/workspaces'
import { getProfile, type Profile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Autorisation de la page Membres — déplacement PUR des helpers gelés hors de `actions.ts`
 * (mêmes noms, mêmes corps, mêmes messages — cf. self-review de la task standard). Admin
 * (superadmin compris) : tout. Manager : uniquement SES chatters — création rattachée à
 * lui (manager_id), édition/suppression bornées par requireEditableTarget, rôle chatteur
 * forcé, modèles de son périmètre.
 */

export type Admin = ReturnType<typeof createAdminClient>

/**
 * Garde d'entrée (premier niveau) : admin (superadmin compris) OU manager — même
 * prédicat que `requireAdminOrManager` (lib/auth), mais SANS `redirect()` : un guard
 * `runAction` tourne sous try/catch (Sentry), qui avalerait le redirect() et le
 * transformerait en erreur générique au lieu de rediriger le navigateur (piège Next.js
 * connu : redirect() throw et doit rester HORS try/catch). Le garde de page
 * (`requireAdminOrManager`, app/(dash)/chatter/members/page.tsx) reste le rempart de
 * premier niveau ; cette re-vérif couvre le résiduel (droit révoqué en cours de
 * session, appel direct de l'action hors UI) — même adaptation que police/scripts/
 * planning/repos (leurs gardes rejouent déjà `getProfile()` plutôt que `requireAdmin*`).
 */
export async function requireCaller(): Promise<Profile | null> {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.manager) return null
  return profile
}

/**
 * Fusionne les pages : le scope courant remplace SES slugs, ceux de l'autre face sont
 * préservés. Le droit de face `marketing` (utilisé par la RLS has_page) suit : posé dès
 * qu'une page mkt-* est cochée, retiré sinon.
 */
export function mergePages(existing: string[], selected: string[], scope: 'chatter' | 'marketing'): string[] {
  const kept = existing.filter((s) => (scope === 'marketing' ? !isMarketingSlug(s) : isMarketingSlug(s)))
  const withFace =
    scope === 'marketing' && selected.length ? [...selected, 'marketing'] : selected
  return [...new Set([...kept, ...withFace])]
}

/**
 * Aligne profile_creators sur `wanted` SANS fenêtre destructrice : upsert des ajouts
 * D'ABORD (idempotent), delete des retraits ENSUITE — un échec au milieu laisse au pire
 * un surplus d'accès temporaire, jamais un membre vidé (qui ne verrait plus rien via la RLS).
 */
export async function syncAssignments(admin: Admin, profileId: string, wanted: string[], scope?: Set<string>): Promise<string | null> {
  const { data: current, error: rErr } = await admin
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', profileId)
  if (rErr) return rErr.message
  const have = new Set((current ?? []).map((c) => c.creator_id))
  const want = new Set(wanted)

  const toAdd = wanted.filter((id) => !have.has(id))
  if (toAdd.length) {
    const { error } = await admin
      .from('profile_creators')
      .upsert(toAdd.map((creator_id) => ({ profile_id: profileId, creator_id })), {
        onConflict: 'profile_id,creator_id',
        ignoreDuplicates: true,
      })
    if (error) return error.message
  }
  // `scope` (appelant manager) : ne retire que dans SON périmètre — une assignation
  // posée par un admin hors scope est préservée (symétrique de mergePages).
  const toRemove = [...have].filter((id) => !want.has(id) && (!scope || scope.has(id)))
  if (toRemove.length) {
    const { error } = await admin
      .from('profile_creators')
      .delete()
      .eq('profile_id', profileId)
      .in('creator_id', toRemove)
    if (error) return error.message
  }
  return null
}

/**
 * Modèles autorisés pour un appelant MANAGER : ses propres profile_creators. Le scoping
 * tient au filtre .eq('profile_id', caller.id) : depuis 0054 la RLS profile_creators
 * laisse un manager lire son équipe — elle n'est plus une ceinture pour cette requête.
 */
export async function requireOwnCreators(
  callerId: string,
  creatorIds: string[],
): Promise<{ error: string } | { allowed: Set<string> }> {
  const supabase = await createClient()
  const { data: own, error } = await supabase
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', callerId)
  if (error) throw new Error(error.message)
  const allowed = new Set((own ?? []).map((c) => c.creator_id))
  if (creatorIds.some((id) => !allowed.has(id))) return { error: 'Modèle hors de ton périmètre' }
  return { allowed }
}

/**
 * Cible éditable : jamais un superadmin (les propriétaires ne se gèrent pas ici) ; une
 * cible admin n'est éditable QUE par un superadmin ; pour un appelant manager,
 * uniquement un compte chatteur de SON équipe (manager_id = lui).
 */
export async function requireEditableTarget(
  admin: Admin,
  id: string,
  caller: Profile,
): Promise<{ error: string } | { role: string }> {
  const { data: target } = await admin.from('profiles').select('role, manager_id').eq('id', id).single()
  if (!target) return { error: 'Profil introuvable' }
  if (target.role === 'superadmin') return { error: 'Un propriétaire ne se gère pas depuis cette page' }
  if (target.role === 'admin' && !caller.superadmin) {
    return { error: 'Seul un propriétaire gère les admins' }
  }
  if (caller.role !== 'admin' && (target.role !== 'chatteur' || target.manager_id !== caller.id)) {
    return { error: "Ce membre n'est pas dans ton équipe" }
  }
  return { role: target.role }
}

/** Rattachement valide = profil existant de rôle manager (vérif côté admin uniquement). */
export async function requireManagerTarget(admin: Admin, managerId: string): Promise<string | null> {
  const { data: mgr } = await admin.from('profiles').select('role').eq('id', managerId).single()
  return mgr?.role === 'manager' || mgr?.role === 'sous-manager'
    ? null
    : 'Rattachement invalide (pas un manager)'
}

export type Role = 'chatteur' | 'sous-manager' | 'manager' | 'admin'

/**
 * Autorise et NORMALISE le rôle + le périmètre modèles d'une mutation selon l'appelant.
 * Partagé create/update pour que ces règles de sécurité soient uniques (un edit divergent
 * ouvrirait un trou). Manager → face chatteurs obligatoire, rôle `chatteur` forcé, modèles
 * bornés à SON périmètre. Rôle `admin` → propriétaires uniquement. Rôle non-admin → au
 * moins une page (re-vérif du refine zod APRÈS forçage : un manager forgeant role:'admin'
 * + pages:[] passerait le refine puis serait forcé chatteur → compte sans page).
 * Retourne `role` effectif et `ownScope` (undefined pour un admin = aucun retrait borné).
 */
export async function authorizeRoleAndScope(
  caller: Profile,
  scope: 'chatter' | 'marketing',
  requestedRole: Role,
  pages: string[],
  creatorIds: string[],
): Promise<{ error: string } | { role: Role; ownScope?: Set<string> }> {
  let role = requestedRole
  let ownScope: Set<string> | undefined
  if (caller.role !== 'admin') {
    if (scope !== 'chatter') return { error: 'Réservé aux admins' }
    role = 'chatteur'
    const own = await requireOwnCreators(caller.id, creatorIds)
    if ('error' in own) return { error: own.error }
    ownScope = own.allowed
  }
  if (role === 'admin' && !caller.superadmin) {
    return { error: 'Seul un propriétaire peut nommer un admin' }
  }
  if (role !== 'admin' && pages.length === 0) {
    return { error: 'Saisie invalide (au moins une page requise)' }
  }
  return { role, ownScope }
}

/**
 * Valeur de `manager_id` à patcher (null = détaché), ou `undefined` pour ne PAS toucher la
 * colonne. Un rôle admin ne porte jamais de rattachement (il voit tout) — nettoyé quelle
 * que soit la face, sinon la fiche promue resterait visible dans la vue équipe de son
 * ex-manager (la policy 0054 ne regarde pas le rôle de la ligne). Sinon le rattachement
 * est un concept de la face chatteurs ; `apply` = false pour un appelant manager en
 * édition (il ne déplace pas un rattachement — la colonne reste préservée).
 */
export function managerIdPatch(role: Role, scope: 'chatter' | 'marketing', managerId: string, apply: boolean) {
  if (role === 'admin') return { manager_id: null }
  if (scope === 'chatter' && apply) return { manager_id: managerId || null }
  return {}
}
