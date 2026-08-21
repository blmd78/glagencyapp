import { planAssignmentSync } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { slugFace, type WorkspaceId } from '@/config/workspaces'
import { getProfile, type Profile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { CrmShift } from '@/lib/types/chatters'
import { ATTACHABLE_ROLES, canBeAttached, type Role } from './types'

/**
 * Autorisation de la page Membres — déplacement PUR des helpers gelés hors de `actions.ts`
 * (mêmes noms, mêmes corps, mêmes messages — cf. self-review de la task standard). Admin
 * (superadmin compris) : tout. Manager : uniquement SES chatters — création rattachée à
 * lui (manager_ids), édition/suppression bornées par requireEditableTarget, rôle chatteur
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
 * Fusionne les pages : le scope courant remplace SES slugs, ceux des autres faces sont
 * préservés. Le droit de face (`marketing`, `formation` — utilisé par la RLS has_page) suit :
 * posé dès qu'une page de la face est cochée, retiré sinon. La face chatteurs n'a pas de droit
 * de face (ses slugs suffisent).
 */
export function mergePages(existing: string[], selected: string[], scope: WorkspaceId): string[] {
  const kept = existing.filter((s) => slugFace(s) !== scope)
  const withFace = scope !== 'chatter' && selected.length ? [...selected, scope] : selected
  return [...new Set([...kept, ...withFace])]
}

/**
 * Aligne profile_creators sur `wanted` SANS fenêtre destructrice : upsert des ajouts
 * D'ABORD (idempotent), delete des retraits ENSUITE — un échec au milieu laisse au pire
 * un surplus d'accès temporaire, jamais un membre vidé (qui ne verrait plus rien via la RLS).
 * QUOI ajouter/retirer est décidé par `planAssignmentSync` (@glagency/core, pur et testé — c'est le
 * périmètre d'accès du membre qui se joue ici) ; cette fonction ne fait qu'exécuter le plan.
 *
 * `seedShift` (0110) : une NOUVELLE assignation d'un chatteur est AMORCÉE avec un placement à son
 * shift principal — c'est ce que le board montrait avant 0110 (assigné + shift = dans la case), on
 * ne fait pas perdre ce réflexe à Membres. Les assignations existantes ne sont jamais touchées
 * (`ignoreDuplicates`) : leurs placements appartiennent au board. null = aucun placement amorcé
 * (personne sans principal, ou rôle non chatteur).
 */
export async function syncAssignments(
  admin: Admin,
  profileId: string,
  wanted: string[],
  scope?: Set<string>,
  seedShift: CrmShift | null = null,
): Promise<string | null> {
  const { data: current, error: rErr } = await admin
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', profileId)
  if (rErr) return rErr.message
  const have = new Set((current ?? []).map((c) => c.creator_id))
  const { toAdd, toRemove } = planAssignmentSync(have, wanted, scope)

  if (toAdd.length) {
    const { error } = await admin
      .from('profile_creators')
      .upsert(
        toAdd.map((creator_id) => ({
          profile_id: profileId,
          creator_id,
          shifts: seedShift ? [seedShift] : [],
        })),
        { onConflict: 'profile_id,creator_id', ignoreDuplicates: true },
      )
    if (error) return error.message
  }
  // `scope` (appelant manager) : ne retire que dans SON périmètre — une assignation
  // posée par un admin hors scope est préservée (symétrique de mergePages).
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
async function requireOwnCreators(
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
 * cible admin n'est éditable QUE par un superadmin ; pour un appelant manager, n'importe
 * quel compte CHATTEUR (0095 : plus d'assignation — tout encadrant gère tous les chatteurs,
 * miroir de la nouvelle `manages()`).
 */
export async function requireEditableTarget(
  admin: Admin,
  id: string,
  caller: Profile,
): Promise<{ error: string } | { role: string; pages: string[] }> {
  // `pages` remonte avec le rôle (même lecture) : updateMember en a besoin pour fusionner les
  // faces (mergePages) et vérifier « au moins une page » — les lire ici évite une seconde
  // requête sur la même ligne, et garantit que ces données de cible ne sont accessibles
  // qu'APRÈS le contrôle d'éditabilité (pas d'oracle par message d'erreur).
  const { data: target } = await admin.from('profiles').select('role, pages').eq('id', id).single()
  if (!target) return { error: 'Profil introuvable' }
  if (target.role === 'superadmin') return { error: 'Un propriétaire ne se gère pas depuis cette page' }
  if (target.role === 'admin' && !caller.superadmin) {
    return { error: 'Seul un propriétaire gère les admins' }
  }
  if (caller.role !== 'admin' && target.role !== 'chatteur') {
    return { error: 'Un manager ne gère que des comptes chatteurs' }
  }
  return { role: target.role, pages: target.pages ?? [] }
}

/**
 * Rattachements valides selon le RÔLE CIBLE — la règle vit dans `ATTACHABLE_ROLES`
 * (types.ts, source unique) : ce helper ne fait que la LIRE, comme le sélecteur du dialog.
 */
export async function requireManagerTargets(
  admin: Admin,
  managerIds: string[],
  targetRole: Role,
): Promise<string | null> {
  if (!managerIds.length) return null
  const allowed = ATTACHABLE_ROLES[targetRole]
  const { data: mgrs } = await admin.from('profiles').select('id, role').in('id', managerIds)
  const ok = new Set((mgrs ?? []).filter((m) => allowed.includes(m.role)).map((m) => m.id))
  return managerIds.every((id) => ok.has(id))
    ? null
    : targetRole === 'sous-manager'
      ? 'Rattachement invalide (un sous-manager se rattache à un manager)'
      : 'Rattachement invalide (pas un manager)'
}

export type { Role } from './types'

/**
 * Autorise et NORMALISE le rôle + le périmètre modèles d'une mutation selon l'appelant.
 * Partagé create/update pour que ces règles de sécurité soient uniques (un edit divergent
 * ouvrirait un trou). Manager → face chatteurs obligatoire, rôle `chatteur` forcé, modèles
 * bornés à SON périmètre. Rôle `admin` → propriétaires uniquement.
 * La règle « au moins une page » ne vit PLUS ici : elle appartient aux appelants, APRÈS ce
 * forçage de rôle (le `role` retourné) — createMember la vérifie sur la saisie brute,
 * updateMember sur la FUSION des faces (mergePages), qui exige les pages de la cible et donc
 * requireEditableTarget d'abord (un membre 100 % Marketing édité depuis Chatteurs envoie
 * pages:[] légitimement, bug 2026-08-17 ; et un refus dépendant de données de cible AVANT le
 * contrôle d'éditabilité offrait un oracle par message d'erreur).
 * Retourne `role` effectif et `ownScope` (undefined pour un admin = aucun retrait borné).
 */
export async function authorizeRoleAndScope(
  caller: Profile,
  scope: WorkspaceId,
  requestedRole: Role,
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
  return { role, ownScope }
}

/**
 * Valeur de `manager_ids` à patcher ('{}' = détaché), ou objet vide pour ne PAS toucher la
 * colonne. Un rôle non rattachable (`canBeAttached` — admin, manager : haut de hiérarchie,
 * décision Benoit 2026-07-29) est nettoyé quelle que soit la face, sinon la fiche promue
 * resterait visible dans la vue équipe de ses ex-managers (la policy 0054 ne regarde pas le
 * rôle de la ligne). Sinon le rattachement est un concept de la face chatteurs ; `apply` =
 * false pour un appelant manager en édition (il ne déplace pas un rattachement — la colonne
 * reste préservée).
 */
export function managerIdsPatch(role: Role, scope: WorkspaceId, managerIds: string[], apply: boolean) {
  if (!canBeAttached(role)) return { manager_ids: [] as string[] }
  if (scope === 'chatter' && apply) return { manager_ids: managerIds }
  return {}
}
