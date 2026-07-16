'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { isMarketingSlug } from '@/config/workspaces'
import { requireAdminOrManager, type Profile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { memberInput, memberUpdateInput } from './schema'

/**
 * Mutations de la page Membres. Toutes : zod → garde applicative → client SERVICE-ROLE
 * (auth.admin.* exige la clé secrète). Admin (superadmin compris) : tout. Manager :
 * uniquement SES chatters — création rattachée à lui (manager_id), édition/suppression
 * bornées par requireEditableTarget, rôle user forcé, modèles de son périmètre.
 */

type Result = { success: true } | { success: false; error: string }
type Admin = ReturnType<typeof createAdminClient>

/**
 * Fusionne les pages : le scope courant remplace SES slugs, ceux de l'autre face sont
 * préservés. Le droit de face `marketing` (utilisé par la RLS has_page) suit : posé dès
 * qu'une page mkt-* est cochée, retiré sinon.
 */
function mergePages(existing: string[], selected: string[], scope: 'chatter' | 'marketing'): string[] {
  const kept = existing.filter((s) => (scope === 'marketing' ? !isMarketingSlug(s) : isMarketingSlug(s)))
  const withFace =
    scope === 'marketing' && selected.length ? [...selected, 'marketing'] : selected
  return [...new Set([...kept, ...withFace])]
}

const revalidateMembers = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
}

/**
 * Aligne profile_creators sur `wanted` SANS fenêtre destructrice : upsert des ajouts
 * D'ABORD (idempotent), delete des retraits ENSUITE — un échec au milieu laisse au pire
 * un surplus d'accès temporaire, jamais un membre vidé (qui ne verrait plus rien via la RLS).
 */
async function syncAssignments(admin: Admin, profileId: string, wanted: string[], scope?: Set<string>): Promise<string | null> {
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
 * tient au filtre .eq('profile_id', caller.id) : depuis 0048 la RLS profile_creators
 * laisse un manager lire son équipe — elle n'est plus une ceinture pour cette requête.
 */
async function requireOwnCreators(
  callerId: string,
  creatorIds: string[],
): Promise<{ error: string } | { allowed: Set<string> }> {
  const supabase = await createClient()
  const { data: own, error } = await supabase
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', callerId)
  if (error) return { error: error.message }
  const allowed = new Set((own ?? []).map((c) => c.creator_id))
  if (creatorIds.some((id) => !allowed.has(id))) return { error: 'Modèle hors de ton périmètre' }
  return { allowed }
}

/**
 * Cible éditable : jamais un superadmin (les propriétaires ne se gèrent pas ici) ; une
 * cible admin n'est éditable QUE par un superadmin ; pour un appelant manager,
 * uniquement un compte user de SON équipe (manager_id = lui).
 */
async function requireEditableTarget(
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
  if (caller.role !== 'admin' && (target.role !== 'user' || target.manager_id !== caller.id)) {
    return { error: "Ce membre n'est pas dans ton équipe" }
  }
  return { role: target.role }
}

/** Rattachement valide = profil existant de rôle manager (vérif côté admin uniquement). */
async function requireManagerTarget(admin: Admin, managerId: string): Promise<string | null> {
  const { data: mgr } = await admin.from('profiles').select('role').eq('id', managerId).single()
  return mgr?.role === 'manager' ? null : 'Rattachement invalide (pas un manager)'
}

type Role = 'user' | 'manager' | 'admin'

/**
 * Autorise et NORMALISE le rôle + le périmètre modèles d'une mutation selon l'appelant.
 * Partagé create/update pour que ces règles de sécurité soient uniques (un edit divergent
 * ouvrirait un trou). Manager → face chatteurs obligatoire, rôle `user` forcé, modèles
 * bornés à SON périmètre. Rôle `admin` → propriétaires uniquement. Rôle non-admin → au
 * moins une page (re-vérif du refine zod APRÈS forçage : un manager forgeant role:'admin'
 * + pages:[] passerait le refine puis serait forcé user → compte sans page).
 * Retourne `role` effectif et `ownScope` (undefined pour un admin = aucun retrait borné).
 */
async function authorizeRoleAndScope(
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
    role = 'user'
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
 * ex-manager (la policy 0048 ne regarde pas le rôle de la ligne). Sinon le rattachement
 * est un concept de la face chatteurs ; `apply` = false pour un appelant manager en
 * édition (il ne déplace pas un rattachement — la colonne reste préservée).
 */
function managerIdPatch(role: Role, scope: 'chatter' | 'marketing', managerId: string, apply: boolean) {
  if (role === 'admin') return { manager_id: null }
  if (scope === 'chatter' && apply) return { manager_id: managerId || null }
  return {}
}

/** Crée le compte auth (email confirmé → OTP direct), le profil, pages + modèles. */
export async function createMember(input: unknown): Promise<Result> {
  const caller = await requireAdminOrManager()
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide (au moins une page requise)' }
  const { scope, email, displayName, pages, creatorIds, workLink } = parsed.data

  const auth = await authorizeRoleAndScope(caller, scope, parsed.data.role, pages, creatorIds)
  if ('error' in auth) return { success: false, error: auth.error }
  const { role, ownScope } = auth
  // Manager : rattachement FORCÉ à lui ; admin : la cible choisie (validée plus bas).
  const managerId = caller.role !== 'admin' ? caller.id : parsed.data.managerId

  const admin = createAdminClient()
  // Rattachement choisi par un admin : la cible doit être un manager (un appelant
  // manager est déjà forcé sur lui-même, garanti manager par la garde). Inutile pour un
  // rôle admin (managerIdPatch le nullifie de toute façon).
  if (role !== 'admin' && scope === 'chatter' && managerId && caller.role === 'admin') {
    const mGuard = await requireManagerTarget(admin, managerId)
    if (mGuard) return { success: false, error: mGuard }
  }
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error || !created.user) {
    return { success: false, error: error?.message ?? 'Création refusée' }
  }
  const uid = created.user.id

  // Le trigger a posé le profil ET son rôle (allowlist → superadmin, sinon user) : on
  // n'écrase jamais un compte allowlisté — le rôle choisi (manager) ne se pose que sur
  // un profil encore user (garde .eq en plus du guard applicatif).
  const { error: pErr } = await admin
    .from('profiles')
    .update({
      display_name: displayName,
      pages: mergePages([], pages, scope),
      work_link: workLink,
      ...managerIdPatch(role, scope, managerId, true),
    })
    .eq('id', uid)
  if (pErr) {
    // Compensation : sans ce patch (manager_id compris) le compte serait un orphelin
    // invisible du manager créateur (RLS) et irréparable par lui — on supprime le
    // compte auth fraîchement créé (best-effort) plutôt que de le laisser en rade.
    await admin.auth.admin.deleteUser(uid)
    return { success: false, error: pErr.message }
  }
  if (role !== 'user') {
    const { error: rErr } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', uid)
      .eq('role', 'user')
    if (rErr) return { success: false, error: rErr.message }
  }
  // Les modèles assignés sont un concept de la face chatteurs uniquement.
  if (scope === 'chatter') {
    const sErr = await syncAssignments(admin, uid, creatorIds, ownScope)
    if (sErr) return { success: false, error: sErr }
  }
  revalidateMembers()
  return { success: true }
}

export async function updateMember(input: unknown): Promise<Result> {
  const caller = await requireAdminOrManager()
  const parsed = memberUpdateInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide (au moins une page requise)' }
  const { scope, id, displayName, pages, creatorIds, workLink, managerId } = parsed.data

  const auth = await authorizeRoleAndScope(caller, scope, parsed.data.role, pages, creatorIds)
  if ('error' in auth) return { success: false, error: auth.error }
  const { role, ownScope } = auth

  const admin = createAdminClient()
  const target = await requireEditableTarget(admin, id, caller)
  if ('error' in target) return { success: false, error: target.error }
  // Cf. createMember : on ne valide pas un rattachement qui sera nullifié (rôle admin).
  if (role !== 'admin' && scope === 'chatter' && managerId && caller.role === 'admin') {
    const mGuard = await requireManagerTarget(admin, managerId)
    if (mGuard) return { success: false, error: mGuard }
  }

  // requireEditableTarget garantit que la cible est éditable par CET appelant (jamais
  // superadmin ; admin seulement pour un propriétaire) → poser `role` est sûr.
  const { data: current } = await admin.from('profiles').select('pages').eq('id', id).single()
  const { error: pErr } = await admin
    .from('profiles')
    .update({
      display_name: displayName,
      role,
      pages: mergePages(current?.pages ?? [], pages, scope),
      work_link: workLink,
      // apply seulement pour un admin : un manager ne déplace pas un rattachement.
      ...managerIdPatch(role, scope, managerId, caller.role === 'admin'),
    })
    .eq('id', id)
  if (pErr) return { success: false, error: pErr.message }
  // La cible cesse d'être manager (démotion user OU promotion admin) : détacher ses
  // chatters, sinon ils restent rattachés à un non-manager — invisibles de tous les
  // managers, et l'édition admin bloquerait sur un rattachement périmé.
  if (target.role === 'manager' && role !== 'manager') {
    const { error: dErr } = await admin.from('profiles').update({ manager_id: null }).eq('manager_id', id)
    if (dErr) return { success: false, error: dErr.message }
  }
  if (scope === 'chatter') {
    const sErr = await syncAssignments(admin, id, creatorIds, ownScope)
    if (sErr) return { success: false, error: sErr }
  }
  revalidateMembers()
  return { success: true }
}

export async function deleteMember(id: unknown): Promise<Result> {
  const caller = await requireAdminOrManager()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { success: false, error: 'Id invalide' }

  const admin = createAdminClient()
  // Manager : requireEditableTarget borne la suppression à SES chatters (rôle user).
  const target = await requireEditableTarget(admin, parsed.data, caller)
  if ('error' in target) return { success: false, error: target.error }
  // Supprime le compte auth → profiles/profile_creators suivent par cascade FK.
  const { error } = await admin.auth.admin.deleteUser(parsed.data)
  if (error) return { success: false, error: error.message }
  revalidateMembers()
  return { success: true }
}
