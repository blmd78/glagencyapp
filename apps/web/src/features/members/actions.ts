'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, BusinessError, DENY_STAFF, type ActionResult } from '@/lib/actions'
import { applyChatterLink } from '@/lib/chatter-link'
import { readStateCookie } from '@/lib/impersonation/session'
import {
  authorizeRoleAndScope,
  managerIdsPatch,
  mergePages,
  requireCaller,
  requireEditableTarget,
  requireManagerTargets,
  syncAssignments,
} from './authz'
import { memberInput, memberUpdateInput } from './schema'
import { canBeAttached } from './types'

/**
 * Mutations de la page Membres. Toutes : zod → autorisation applicative → client SERVICE-ROLE
 * (auth.admin.* exige la clé secrète). Admin (superadmin compris) : tout. Manager :
 * uniquement SES chatters — création rattachée à lui (manager_ids), édition/suppression
 * bornées par requireEditableTarget, rôle user forcé, modèles de son périmètre.
 * Autorisation fine (gardes fail-closed, démotion/detach, compensation deleteUser) :
 * `./authz.ts` — helpers GELÉS (mêmes noms, mêmes corps, mêmes messages, cf. self-review de
 * la task standard), ce fichier ne garde QUE les Server Actions.
 *
 * Patron §4 des guidelines : l'autorisation est vérifiée UNE SEULE FOIS, en tête de handler
 * (`noGuard` satisfait `runAction`) — un refus lève `BusinessError` avec le message des
 * helpers gelés, dans le même ordre qu'avant la migration (dette guard+handler soldée
 * 2026-07). Erreur technique de mutation (Supabase) = throw → message générique (jamais un
 * `error.message` brut à l'UI) ; le doublon d'email, lui, est un refus MÉTIER
 * (BusinessError + fieldErrors). La compensation deleteUser reste identique.
 */

const revalidateMembers = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
  // Le board Organisation dérive de Membres (assignations, liens, shifts) : même fraîcheur.
  revalidatePath('/chatter/organisation')
}

// LE SHIFT N'A PLUS DE HELPER DÉDIÉ (0100). Il vivait sur `chatters.shift` — la fiche MyPuls —
// ce qui imposait `applyShift` : résoudre le lien, écrire sur l'autre table, et NE RIEN FAIRE
// pour un encadrant (le formulaire d'un manager portait `shift: null` faute de pouvoir lire la
// table admin-only, si bien qu'un simple enregistrement de pages effaçait le shift — audit
// 2026-07-29). Porté par `profiles`, c'est une colonne du membre comme `closing_role` : écrite
// dans le patch principal de createMember/updateMember, lisible par tout encadrant (0097), et
// indépendante du lien MyPuls — les chatteurs sans fiche ont enfin un shift.

/** Crée le compte auth (email confirmé → OTP direct), le profil, pages + modèles. */
export async function createMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: memberInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      // Autorisation UNE SEULE FOIS (patron §4) — mêmes helpers gelés, mêmes messages et
      // même ordre de refus que l'ancien guard ; un refus = BusinessError (affiché tel quel).
      const caller = await requireCaller()
      if (!caller) throw new BusinessError(DENY_STAFF)
      const { scope, email, displayName, pages, creatorIds, workLink, closingRole, closingTeam, chatterId } =
        values

      const auth = await authorizeRoleAndScope(caller, scope, values.role, pages, creatorIds)
      if ('error' in auth) throw new BusinessError(auth.error)
      const { role, ownScope } = auth
      // Manager : rattachement FORCÉ à lui ; admin : les cibles choisies (validées ci-dessous).
      const managerIds = caller.role !== 'admin' ? [caller.id] : values.managerIds

      const admin = createAdminClient()
      // Rattachements choisis par un admin : chaque cible doit être valide pour le rôle (un
      // appelant manager est déjà forcé sur lui-même, garanti manager par requireCaller).
      // Inutile pour un rôle non rattachable (managerIdsPatch le vide de toute façon).
      if (canBeAttached(role) && scope === 'chatter' && managerIds.length && caller.role === 'admin') {
        const mErr = await requireManagerTargets(admin, managerIds, role)
        if (mErr) throw new BusinessError(mErr)
      }
      if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })
      if (error) {
        // Cas MÉTIER, pas technique : `error.code` porte le code d'erreur STRUCTURÉ renvoyé
        // par GoTrue (`ErrorCode` de @supabase/auth-js, HTTP 422 — le client le lit depuis le
        // corps JSON `error_code`/`code`, cf. node_modules/@supabase/auth-js/src/lib/fetch.ts
        // `handleError`). Fiable, contrairement à un `message.includes('already')` qui casse au
        // premier changement de wording ou de langue côté GoTrue.
        if (error.code === 'email_exists') {
          throw new BusinessError(
            'Un compte existe déjà avec cet email. Il est peut-être hors de ton périmètre ' +
              '(pages ou modèles que tu ne vois pas) — demande à un admin de vérifier.',
            { email: ['Cet email est déjà utilisé par un compte existant.'] },
          )
        }
        throw new Error(error.message)
      }
      if (!created.user) throw new Error('Création refusée')
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
          // Désignation closing : uniquement pour un chatteur, null sinon (un manager/police
          // n'est pas setter/closer). Cf. 0077 — attribut porté par le membre, indépendant de chatters.
          closing_role: role === 'chatteur' ? closingRole : null,
          closing_team: role === 'chatteur' ? closingTeam : null,
          // Shift : même règle, et depuis 0100 même TABLE que le closing (il vivait sur la fiche
          // MyPuls, ce qui le rendait inaccessible aux chatteurs sans lien).
          shift: role === 'chatteur' ? values.shift : null,
          // Nouvel arrivant (0101) : même règle de rôle. `arrived_at` ne survit pas à un rôle
          // non-chatteur — un drapeau orphelin sur un manager ne voudrait rien dire.
          is_new: role === 'chatteur' ? values.isNew : false,
          arrived_at: role === 'chatteur' ? values.arrivedAt : null,
          // « Créé par » (0098) — l'appelant de la création, jamais réécrit ensuite.
          created_by: caller.id,
          // « Modifié par » (0101) : LU PAR LE TRIGGER D'HISTORIQUE. Cette page écrit en
          // service role, où `auth.uid()` est null — sans cette colonne, tout changement fait
          // ici serait attribué à « système ».
          updated_by: caller.id,
          ...managerIdsPatch(role, scope, managerIds, true),
        })
        .eq('id', uid)
      if (pErr) {
        // Compensation : sans ce patch (manager_ids compris) le compte serait un orphelin
        // invisible du manager créateur (RLS) et irréparable par lui — on supprime le
        // compte auth fraîchement créé (best-effort) plutôt que de le laisser en rade.
        await admin.auth.admin.deleteUser(uid)
        throw new Error(pErr.message)
      }
      // Lien chatteur : uniquement pour un membre role chatteur (miroir du gate closing ci-dessus) —
      // sinon on force à null pour ne pas « consommer » l'unicité d'un chatteur sur un non-chatteur.
      await applyChatterLink(admin, caller, uid, role === 'chatteur' ? chatterId : '')
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
    guard: noGuard,
    handler: async (values) => {
      // Même patron §4 que createMember : autorisation unique en tête de handler, mêmes
      // helpers gelés, même ordre de refus. `target.role` resservira pour la démotion.
      const caller = await requireCaller()
      if (!caller) throw new BusinessError(DENY_STAFF)
      const { scope, id, displayName, pages, creatorIds, workLink, managerIds, closingRole, closingTeam, chatterId } =
        values

      const auth = await authorizeRoleAndScope(caller, scope, values.role, pages, creatorIds)
      if ('error' in auth) throw new BusinessError(auth.error)
      const { role, ownScope } = auth

      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) throw new BusinessError(target.error)
      // Cf. createMember : on ne valide pas un rattachement qui sera vidé (rôle non rattachable).
      if (canBeAttached(role) && scope === 'chatter' && managerIds.length && caller.role === 'admin') {
        const mErr = await requireManagerTargets(admin, managerIds, role)
        if (mErr) throw new BusinessError(mErr)
      }
      if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')

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
          // Désignation closing : uniquement pour un chatteur, null sinon (cf. 0077, createMember).
          closing_role: role === 'chatteur' ? closingRole : null,
          closing_team: role === 'chatteur' ? closingTeam : null,
          // Shift (0100) : attribut du membre, remis à null si la cible cesse d'être chatteur.
          shift: role === 'chatteur' ? values.shift : null,
          // Nouvel arrivant (0101) : même règle. Décocher le drapeau NE VIDE PAS `arrived_at` —
          // c'est voulu (base du calcul d'ancienneté/turnover) ; seul un changement de rôle
          // l'efface, puisque la personne quitte le dispositif chatteur.
          is_new: role === 'chatteur' ? values.isNew : false,
          arrived_at: role === 'chatteur' ? values.arrivedAt : null,
          // LU PAR LE TRIGGER D'HISTORIQUE (0101), et écrit AVANT `syncAssignments` plus bas —
          // c'est ce qui permet au trigger de `profile_creators` de retrouver l'auteur d'un
          // changement de modèle malgré le service role. Ne pas déplacer cette écriture après.
          updated_by: caller.id,
          // apply seulement pour un admin : un manager ne déplace pas un rattachement.
          ...managerIdsPatch(role, scope, managerIds, caller.role === 'admin'),
        })
        .eq('id', id)
      if (pErr) throw new Error(pErr.message)
      // Lien chatteur : uniquement pour un membre role chatteur (miroir du gate closing) — un membre
      // promu manager/police/admin voit son chatter_id remis à null (sinon lien orphelin non réparable).
      // La danse beforeLink/afterLink qui protégeait le shift ici (audit 2026-07-29) a disparu
      // avec 0100 : le shift ne vit plus sur la fiche MyPuls, donc re-lier un membre à une AUTRE
      // fiche ne peut plus écraser le shift de personne — il est écrit avec le reste du profil.
      await applyChatterLink(admin, caller, id, role === 'chatteur' ? chatterId : '')
      // La cible cesse d'être manager/sous-manager (démotion chatteur OU promotion admin) :
      // détacher ses chatteurs, sinon ils restent rattachés à un non-manager — invisibles de
      // tous les managers, et l'édition admin bloquerait sur un rattachement périmé.
      if (
        (target.role === 'manager' || target.role === 'sous-manager') &&
        role !== 'manager' &&
        role !== 'sous-manager'
      ) {
        // `manager_ids` est un uuid[] : pas d'array_remove en PostgREST → on récupère les
        // rattachés (`cs` contains) et on filtre ligne à ligne (rare geste admin, peu de
        // lignes). La SUPPRESSION d'un membre, elle, est couverte par le trigger 0092.
        const { data: attached, error: aErr } = await admin
          .from('profiles')
          .select('id, manager_ids')
          .contains('manager_ids', [id])
        if (aErr) throw new Error(aErr.message)
        for (const row of attached ?? []) {
          const { error: dErr } = await admin
            .from('profiles')
            .update({ manager_ids: (row.manager_ids ?? []).filter((m) => m !== id) })
            .eq('id', row.id)
          if (dErr) throw new Error(dErr.message)
        }
      }
      if (scope === 'chatter') {
        const sErr = await syncAssignments(admin, id, creatorIds, ownScope)
        if (sErr) throw new Error(sErr)
      }
      revalidateMembers()
    },
  })
}
