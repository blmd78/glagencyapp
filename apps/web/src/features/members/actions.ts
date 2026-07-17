'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'
import {
  authorizeRoleAndScope,
  managerIdPatch,
  mergePages,
  requireCaller,
  requireEditableTarget,
  requireManagerTarget,
  syncAssignments,
} from './authz'
import { memberInput, memberUpdateInput } from './schema'

/**
 * Mutations de la page Membres. Toutes : zod → garde applicative → client SERVICE-ROLE
 * (auth.admin.* exige la clé secrète). Admin (superadmin compris) : tout. Manager :
 * uniquement SES chatters — création rattachée à lui (manager_id), édition/suppression
 * bornées par requireEditableTarget, rôle user forcé, modèles de son périmètre.
 * Autorisation fine (gardes fail-closed, démotion/detach, compensation deleteUser) :
 * `./authz.ts` — DÉPLACEMENT PUR des helpers gelés (mêmes noms, mêmes corps, mêmes
 * messages, cf. self-review de la task), ce fichier ne garde QUE les Server Actions.
 *
 * Standard runAction (docs/guidelines-standard-feature.md §4) : la garde d'entrée +
 * TOUTE l'autorisation fine (lectures pures, avant mutation) vivent dans `guard`
 * (mêmes fonctions, mêmes messages, verbatim) ; `handler` re-dérive le même résultat à
 * partir des `values` déjà validées (les branches 'error' y sont une course résiduelle
 * impossible en pratique, cf. saveBlock/moveScriptItem) avant d'exécuter les mutations.
 * Erreur technique de mutation (Supabase) = throw → message générique (jamais un
 * `error.message` brut à l'UI) — la compensation deleteUser reste identique.
 */

const revalidateMembers = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
}

/** Crée le compte auth (email confirmé → OTP direct), le profil, pages + modèles. */
export async function createMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: memberInput,
    input: raw,
    guard: async () => {
      const caller = await requireCaller()
      if (!caller) return { ok: false, error: 'Accès refusé' }
      // Parse défensif de `raw` (capturé par fermeture) : si invalide, laissé au safeParse
      // de runAction — pattern planning/scripts (docs/guidelines-standard-feature.md §4).
      const parsed = memberInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const { scope, pages, creatorIds, managerId: requestedManagerId } = parsed.data

      const auth = await authorizeRoleAndScope(caller, scope, parsed.data.role, pages, creatorIds)
      if ('error' in auth) return { ok: false, error: auth.error }

      // Manager : rattachement FORCÉ à lui ; admin : la cible choisie (validée ci-dessous).
      const managerId = caller.role !== 'admin' ? caller.id : requestedManagerId
      if (auth.role !== 'admin' && scope === 'chatter' && managerId && caller.role === 'admin') {
        const admin = createAdminClient()
        const mErr = await requireManagerTarget(admin, managerId)
        if (mErr) return { ok: false, error: mErr }
      }
      return { ok: true }
    },
    handler: async (values) => {
      // Mémoïsé par requête (cache(), lib/auth) — pas de round-trip DB supplémentaire par
      // rapport à l'appel déjà fait dans la garde.
      const caller = await getProfile()
      if (!caller) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const { scope, email, displayName, pages, creatorIds, workLink } = values

      // Re-dérive role/ownScope (mêmes fonctions gelées, mêmes messages) : le guard a déjà
      // validé — les branches 'error' ci-dessous sont une course résiduelle impossible en
      // pratique (cf. modèle saveBlock/moveScriptItem, guidelines §4).
      const auth = await authorizeRoleAndScope(caller, scope, values.role, pages, creatorIds)
      if ('error' in auth) throw new Error(auth.error) // impossible si le guard a laissé passer
      const { role, ownScope } = auth
      const managerId = caller.role !== 'admin' ? caller.id : values.managerId

      const admin = createAdminClient()
      // Rattachement choisi par un admin : la cible doit être un manager (un appelant
      // manager est déjà forcé sur lui-même, garanti manager par la garde). Inutile pour un
      // rôle admin (managerIdPatch le nullifie de toute façon).
      if (role !== 'admin' && scope === 'chatter' && managerId && caller.role === 'admin') {
        const mErr = await requireManagerTarget(admin, managerId)
        if (mErr) throw new Error(mErr) // impossible si le guard a laissé passer
      }
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })
      if (error || !created.user) throw new Error(error?.message ?? 'Création refusée')
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
        throw new Error(pErr.message)
      }
      if (role !== 'chatteur') {
        const { error: rErr } = await admin
          .from('profiles')
          .update({ role })
          .eq('id', uid)
          .eq('role', 'chatteur')
        if (rErr) throw new Error(rErr.message)
      }
      // Les modèles assignés sont un concept de la face chatteurs uniquement.
      if (scope === 'chatter') {
        const sErr = await syncAssignments(admin, uid, creatorIds, ownScope)
        if (sErr) throw new Error(sErr)
      }
      revalidateMembers()
    },
  })
}

export async function updateMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: memberUpdateInput,
    input: raw,
    guard: async () => {
      const caller = await requireCaller()
      if (!caller) return { ok: false, error: 'Accès refusé' }
      const parsed = memberUpdateInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const { scope, id, pages, creatorIds, managerId } = parsed.data

      const auth = await authorizeRoleAndScope(caller, scope, parsed.data.role, pages, creatorIds)
      if ('error' in auth) return { ok: false, error: auth.error }

      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) return { ok: false, error: target.error }
      // Cf. createMember : on ne valide pas un rattachement qui sera nullifié (rôle admin).
      if (auth.role !== 'admin' && scope === 'chatter' && managerId && caller.role === 'admin') {
        const mErr = await requireManagerTarget(admin, managerId)
        if (mErr) return { ok: false, error: mErr }
      }
      return { ok: true }
    },
    handler: async (values) => {
      const caller = await getProfile()
      if (!caller) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const { scope, id, displayName, pages, creatorIds, workLink, managerId } = values

      const auth = await authorizeRoleAndScope(caller, scope, values.role, pages, creatorIds)
      if ('error' in auth) throw new Error(auth.error) // impossible si le guard a laissé passer
      const { role, ownScope } = auth

      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) throw new Error(target.error) // impossible si le guard a laissé passer
      if (role !== 'admin' && scope === 'chatter' && managerId && caller.role === 'admin') {
        const mErr = await requireManagerTarget(admin, managerId)
        if (mErr) throw new Error(mErr) // impossible si le guard a laissé passer
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
      if (pErr) throw new Error(pErr.message)
      // La cible cesse d'être manager/sous-manager (démotion chatteur OU promotion admin) :
      // détacher ses chatteurs, sinon ils restent rattachés à un non-manager — invisibles de
      // tous les managers, et l'édition admin bloquerait sur un rattachement périmé.
      if (
        (target.role === 'manager' || target.role === 'sous-manager') &&
        role !== 'manager' &&
        role !== 'sous-manager'
      ) {
        const { error: dErr } = await admin.from('profiles').update({ manager_id: null }).eq('manager_id', id)
        if (dErr) throw new Error(dErr.message)
      }
      if (scope === 'chatter') {
        const sErr = await syncAssignments(admin, id, creatorIds, ownScope)
        if (sErr) throw new Error(sErr)
      }
      revalidateMembers()
    },
  })
}

const deleteMemberInput = z.uuid()

export async function deleteMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteMemberInput,
    input: raw,
    guard: async () => {
      const caller = await requireCaller()
      if (!caller) return { ok: false, error: 'Accès refusé' }
      const parsed = deleteMemberInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const admin = createAdminClient()
      // Manager : requireEditableTarget borne la suppression à SES chatters (rôle user).
      const target = await requireEditableTarget(admin, parsed.data, caller)
      if ('error' in target) return { ok: false, error: target.error }
      return { ok: true }
    },
    handler: async (id) => {
      const caller = await getProfile()
      if (!caller) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) throw new Error(target.error) // impossible si le guard a laissé passer
      // Supprime le compte auth → profiles/profile_creators suivent par cascade FK.
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw new Error(error.message)
      revalidateMembers()
    },
  })
}
