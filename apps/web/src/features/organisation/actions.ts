'use server'

// Server Actions du board Organisation — ÉDITION EN WRITE-THROUGH : les cases écrivent les
// VRAIES données (profile_creators = assignation au modèle, chatters.shift via le lien
// MyPuls), jamais une copie — Membres/Chatters et le board restent une seule vérité.
// Édition ADMIN uniquement (v1) : réassigner un modèle change le périmètre RLS du chatteur,
// même pouvoir que le dialog Membres admin. Client service-role, garde en tête de handler.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { CRM_SHIFTS } from '@/lib/types/chatters'
import { BusinessError, runAction, noGuard, requireAdminProfile, type ActionResult } from '@/lib/actions'

const cellInput = z.object({
  creatorId: z.uuid(),
  shift: z.enum(CRM_SHIFTS),
  /** L'état COMPLET voulu de la case (modèle × shift) après édition. */
  chatterIds: z.array(z.uuid()).max(100),
  /** L'état AVANT édition (affiché au client) — sert à calculer ajouts/retraits. */
  previousIds: z.array(z.uuid()).max(100),
})

/**
 * Sauvegarde d'une case (modèle × shift) :
 *  - AJOUTÉ   → assigné au modèle (upsert profile_creators) + shift posé sur sa fiche
 *               chatteur (via le lien MyPuls ; sans lien, il reste « à placer » — visible) ;
 *  - RETIRÉ   → désassigné du modèle SEULEMENT si son shift est encore celui de la case
 *               (un déplacement de shift = retrait d'une case + ajout dans l'autre, dans
 *               n'importe quel ordre : le retrait voit alors un shift différent → no-op).
 */
export async function saveOrgCell(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: cellInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfile()
      const supabase = await createClient()
      // UN SEUL aller-retour (RPC 0099) : l'ancienne version enchaînait plusieurs requêtes
      // PAR personne touchée — c'est ce qui rendait l'édition lente sur base distante.
      const { error } = await supabase.rpc('save_org_cell', {
        p_creator_id: values.creatorId,
        p_shift: values.shift,
        p_chatter_ids: values.chatterIds,
        p_previous_ids: values.previousIds,
      })
      if (error) {
        if (error.message.includes('org_acces_refuse')) throw new BusinessError('Accès refusé')
        throw new Error(error.message)
      }
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}

const rowInput = z.object({
  /** Nouveau porteur de l'assignation (sous-manager, ou manager pour « direct »). */
  ownerId: z.uuid(),
  creatorId: z.uuid(),
  /** Paire actuelle à remplacer — null = AJOUT d'une ligne. */
  prevOwnerId: z.uuid().nullable(),
  prevCreatorId: z.uuid().nullable(),
  /** Section visée : si le porteur est un sous-manager NON rattaché à ce manager, il l'est
   *  rendu — sans quoi la ligne n'apparaîtrait dans aucune section (audit 2026-07-29). */
  sectionManagerId: z.uuid().nullable().optional(),
})

/**
 * Déplace/ajoute une LIGNE du board : la paire (owner, modèle). Changer le modèle d'une
 * ligne, son sous-manager, ou passer un modèle en « direct » = supprimer l'ancienne paire et
 * poser la nouvelle (profile_creators de l'encadrant). Les chatters du modèle ne bougent
 * pas — seule l'assignation d'ENCADREMENT change.
 */
export async function saveOrgRow(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: rowInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfile()
      const supabase = await createClient()
      // UN SEUL aller-retour (RPC 0099) : remplacement de la paire, alignement du porteur
      // jumeau et rattachement du sous-manager tiennent dans la fonction — l'ancienne version
      // faisait jusqu'à 10 requêtes séquentielles.
      const { error } = await supabase.rpc('save_org_row', {
        p_owner_id: values.ownerId,
        p_creator_id: values.creatorId,
        p_prev_owner_id: values.prevOwnerId,
        p_prev_creator_id: values.prevCreatorId,
        p_section_manager_id: values.sectionManagerId ?? null,
      })
      if (error) {
        if (error.message.includes('org_porteur_invalide'))
          throw new BusinessError('Le porteur d’une ligne doit être un encadrant')
        if (error.message.includes('org_acces_refuse')) throw new BusinessError('Accès refusé')
        throw new Error(error.message)
      }
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}

const deleteRowInput = z.object({ ownerId: z.uuid(), creatorId: z.uuid() })

/**
 * Supprime une LIGNE : l'encadrant perd l'assignation du modèle. Les chatters du modèle ne
 * bougent pas — le modèle réapparaît simplement en « sans équipe » s'il ne reste couvert par
 * personne, et les chatteurs gardent leur assignation (c'est leur périmètre d'accès).
 */
export async function deleteOrgRow(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteRowInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfile()
      const admin = createAdminClient()
      const { error } = await admin
        .from('profile_creators')
        .delete()
        .eq('profile_id', values.ownerId)
        .eq('creator_id', values.creatorId)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}

const teamInput = z.object({
  sousManagerId: z.uuid(),
  /** null = le sous-manager n'était rattaché à personne (section « Sans manager »). */
  fromManagerId: z.uuid().nullable(),
  toManagerId: z.uuid(),
})

/**
 * Change le MANAGER d'un sous-manager (colonne Manager d'une ligne à sous-manager) : toute
 * son équipe — toutes ses lignes — passe sous le nouveau manager (rattachement manager_ids,
 * multi conservé : seul le manager de la section quittée est remplacé).
 */
export async function moveOrgTeam(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: teamInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfile()
      const admin = createAdminClient()
      const { sousManagerId, fromManagerId, toManagerId } = values
      const [{ data: sm, error: sErr }, { data: to, error: tErr }] = await Promise.all([
        admin.from('profiles').select('role, manager_ids').eq('id', sousManagerId).maybeSingle(),
        admin.from('profiles').select('role').eq('id', toManagerId).maybeSingle(),
      ])
      if (sErr) throw new Error(sErr.message)
      if (tErr) throw new Error(tErr.message)
      if (sm?.role !== 'sous-manager') throw new BusinessError('La ligne n’a pas de sous-manager à déplacer')
      // Un ADMIN peut diriger une équipe (Axel, Dorian) — cf. ATTACHABLE_ROLES.
      if (!to || !['admin', 'manager'].includes(to.role))
        throw new BusinessError('La cible doit être un manager ou un admin')
      const next = [...new Set([...(sm.manager_ids ?? []).filter((m) => m !== fromManagerId), toManagerId])]
      const { error } = await admin.from('profiles').update({ manager_ids: next }).eq('id', sousManagerId)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}
