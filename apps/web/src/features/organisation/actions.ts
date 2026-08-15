'use server'

// Server Actions du board Organisation — ÉDITION EN WRITE-THROUGH : les cases écrivent les
// VRAIES données (profile_creators = assignation au modèle, profiles.shift depuis 0100),
// jamais une copie — Membres et le board restent une seule vérité.
//
// DEUX NIVEAUX DE DROIT, comme le planning repos :
//  • COMPOSER UNE CASE (saveOrgCell) = admin OU encadrant porteur de la page `organisation`
//    (miroir de `can_write_page('organisation')` dans le RPC, 0100) ;
//  • STRUCTURE (saveOrgRow, deleteOrgRow, moveOrgTeam) = ADMIN seul : ajouter/supprimer une
//    ligne ou déplacer une équipe réécrit l'organigramme, pas la composition d'un shift.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { CRM_SHIFTS } from '@/lib/types/chatters'
import {
  BusinessError,
  runAction,
  noGuard,
  requireAdminProfile,
  requireWriteProfile,
  DENY_WRITE,
  type ActionResult,
} from '@/lib/actions'

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
 *  - AJOUTÉ   → assigné au modèle (upsert profile_creators) + shift posé sur le MEMBRE ;
 *  - RETIRÉ   → désassigné du modèle SEULEMENT si son shift est encore celui de la case
 *               (un déplacement de shift = retrait d'une case + ajout dans l'autre, dans
 *               n'importe quel ordre : le retrait voit alors un shift différent → no-op).
 *
 * Ouvert aux encadrants porteurs de la page (0100). La garde ci-dessous n'est qu'un MIROIR du
 * `can_write_page('organisation')` que le RPC applique en base — l'enforcement réel est là-bas.
 */
export async function saveOrgCell(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: cellInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireWriteProfile('organisation')
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
        if (error.message.includes('org_acces_refuse')) throw new BusinessError(DENY_WRITE)
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
      // `?? undefined` sur les trois arguments optionnels : ils ont un `default null` en SQL
      // (0101) et les types générés les rendent optionnels — on OMET la clé au lieu d'envoyer
      // null, comme `upsert_police_report`. `supabase gen types` ne sait pas exprimer un
      // argument nullable, il générerait `string` et l'appel ne compilerait pas.
      const { error } = await supabase.rpc('save_org_row', {
        p_owner_id: values.ownerId,
        p_creator_id: values.creatorId,
        p_prev_owner_id: values.prevOwnerId ?? undefined,
        p_prev_creator_id: values.prevCreatorId ?? undefined,
        p_section_manager_id: values.sectionManagerId ?? undefined,
      })
      if (error) {
        if (error.message.includes('org_porteur_invalide'))
          throw new BusinessError('Le porteur d’une ligne doit être un encadrant')
        if (error.message.includes('org_acces_refuse')) throw new BusinessError(DENY_WRITE)
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
      const supabase = await createClient()
      // UN SEUL aller-retour : les deux lectures de contrôle et l'UPDATE tiennent dans le RPC
      // (0099), comme pour les deux autres écritures du board.
      const { error } = await supabase.rpc('move_org_team', {
        p_sous_manager_id: values.sousManagerId,
        p_to_manager_id: values.toManagerId,
        // `?? undefined` : `default null` en SQL → argument optionnel côté types générés.
        p_from_manager_id: values.fromManagerId ?? undefined,
      })
      if (error) {
        if (error.message.includes('org_pas_de_sous_manager'))
          throw new BusinessError('La ligne n’a pas de sous-manager à déplacer')
        if (error.message.includes('org_cible_invalide'))
          throw new BusinessError('La cible doit être un manager ou un admin')
        if (error.message.includes('org_acces_refuse')) throw new BusinessError(DENY_WRITE)
        throw new Error(error.message)
      }
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}
