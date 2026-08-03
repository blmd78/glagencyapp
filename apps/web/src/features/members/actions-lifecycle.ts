'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { requireCaller, requireEditableTarget } from './authz'
import { getMemberEvents } from './services/get-member-events'
import { departureInput } from './schema'
import type { MemberEvent } from './types'

/**
 * CYCLE DE VIE d'un membre : son départ, son retour, sa suppression définitive, et la lecture de
 * son historique. Séparé de `actions.ts` (création/édition) comme `actions-pay.ts` l'est pour la
 * paie — la règle « > 300 lignes, split par responsabilité » (guidelines-standard-feature §1), et
 * surtout deux sujets distincts : là on décrit un membre, ici on décide s'il est encore là.
 *
 * Même patron §4 que ses voisins : `noGuard` + autorisation UNE FOIS en tête de handler, refus en
 * `BusinessError`, erreur technique en `throw` (message générique + Sentry via `runAction`).
 */

const revalidateMembers = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
  // Le board Organisation dérive de Membres : un départ l'en retire, même fraîcheur.
  revalidatePath('/chatter/organisation')
}

/**
 * Historique d'un membre (0104) — chargé À L'OUVERTURE de l'onglet, pas avec le dialog : la
 * fiche ne paie cette lecture que si on la demande. Patron `loadPlanning`.
 *
 * Garde en tête de handler avec `noGuard` (§4) : la page Membres n'a pas de slug cochable
 * (`adminOnly` + `managerAccess`), donc ni `pageGuard` ni `adminGuard` ne conviennent —
 * `requireCaller` porte exactement la règle « admin ou encadrant » de cette page.
 */
export async function loadMemberEvents(raw: unknown): Promise<ActionResult<MemberEvent[]>> {
  return runAction({
    schema: z.object({ profileId: z.uuid() }),
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      const caller = await requireCaller()
      if (!caller) throw new BusinessError('Accès refusé')
      return getMemberEvents({ profileId })
    },
  })
}

/**
 * 100 ans. GoTrue attend une DURÉE, pas une date de fin ; le ban se lève par `'none'`
 * (`reactivateMember`), il n'expire donc jamais tout seul.
 */
const BAN_FOREVER = '876000h'

/**
 * ENREGISTRER UN DÉPART (0102) — ce qui remplace la suppression pour un vrai départ.
 *
 * Le compte est BANNI côté GoTrue, jamais supprimé : `deleteUser` déclencherait la cascade
 * `profiles_id_fkey` qui effacerait le profil, c'est-à-dire la donnée même qu'on est en train
 * d'écrire. Le ban invalide session, API et RLS ensemble — c'est le vrai verrou d'accès.
 *
 * Droits : ceux de `requireEditableTarget`, inchangés (admin sur tout, manager sur un chatteur) —
 * un manager peut donc acter un départ, mais plus supprimer (cf. `deleteMember`).
 */
export async function recordDeparture(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: departureInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const caller = await requireCaller()
      if (!caller) throw new BusinessError('Accès refusé')
      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, values.id, caller)
      if ('error' in target) throw new BusinessError(target.error)
      if (await readStateCookie())
        throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')

      // ORDRE VOULU : la DONNÉE d'abord, le ban ensuite. Si le ban échoue, le départ est
      // enregistré et le geste se rejoue sans rien perdre. L'inverse laisserait un compte muet,
      // sans accès et sans trace — exactement ce qu'on cherche à ne plus produire.
      const { error: pErr } = await admin
        .from('profiles')
        .update({
          left_at: values.leftAt,
          left_reason: values.leftReason,
          left_note: values.leftNote || null,
          left_by: caller.id,
          updated_by: caller.id,
        })
        .eq('id', values.id)
      if (pErr) throw new Error(pErr.message)

      const { error: bErr } = await admin.auth.admin.updateUserById(values.id, {
        ban_duration: BAN_FOREVER,
      })
      if (bErr) throw new Error(bErr.message)
      revalidateMembers()
    },
  })
}

/**
 * RETOUR D'UN ANCIEN : on lève le ban et on efface les quatre colonnes.
 *
 * Le départ précédent disparaît alors des statistiques — assumé tant qu'il n'existe pas de table
 * d'événements (chantier « historique »). Un aller-retour multiple sera correctement historisé
 * quand elle existera ; d'ici là, `profiles` ne porte qu'un ÉTAT COURANT, pas une chronologie.
 */
export async function reactivateMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(),
    input: raw,
    guard: noGuard,
    handler: async (id) => {
      const caller = await requireCaller()
      if (!caller) throw new BusinessError('Accès refusé')
      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) throw new BusinessError(target.error)
      if (await readStateCookie())
        throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')

      // Le ban d'abord ici : rendre l'accès à quelqu'un dont la fiche dit encore « parti »
      // est inoffensif ; l'inverse (fiche réactivée mais compte encore banni) produirait un
      // membre qui a l'air en poste et ne peut pas se connecter, sans que rien ne le signale.
      const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
      if (bErr) throw new Error(bErr.message)
      const { error: pErr } = await admin
        .from('profiles')
        .update({ left_at: null, left_reason: null, left_note: null, left_by: null, updated_by: caller.id })
        .eq('id', id)
      if (pErr) throw new Error(pErr.message)
      revalidateMembers()
    },
  })
}

const deleteMemberInput = z.uuid()

export async function deleteMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteMemberInput,
    input: raw,
    guard: noGuard,
    handler: async (id) => {
      // Même patron §4 : autorisation unique en tête de handler.
      const caller = await requireCaller()
      if (!caller) throw new BusinessError('Accès refusé')
      const admin = createAdminClient()
      // Manager : requireEditableTarget borne la suppression à SES chatters (rôle user).
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) throw new BusinessError(target.error)
      if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
      // LA CORBEILLE NE SERT PLUS QU'AUX ERREURS DE SAISIE. Elle DÉTRUIT (cascade
      // `profiles_id_fkey`) : un vrai départ s'enregistre (`recordDeparture`), il ne s'efface pas
      // — sinon on reperd le turnover que 0102 vient de rendre mesurable. Reste indispensable pour
      // le compte créé par erreur : doublon, faute de frappe dans l'email (incident Akari,
      // audit 2026-07-19).
      //
      // ADMIN ET SUPERADMIN, plus les managers (décision Benoit 2026-07-30) : ce sont eux qui
      // créent les comptes et qui en ratent, donc ceux qui nettoient doivent être au-dessus.
      // RETRAIT DE DROIT assumé — un manager pouvait supprimer un chatteur jusqu'ici.
      // `caller.role === 'admin'` couvre le superadmin, que `getProfile` y mappe.
      if (caller.role !== 'admin')
        throw new BusinessError('Un départ s’enregistre — il ne se supprime pas')
      // Supprime le compte auth → profiles/profile_creators suivent par cascade FK.
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw new Error(error.message)
      revalidateMembers()
    },
  })
}
