'use server'

// Server Actions du board Organisation — ÉDITION EN WRITE-THROUGH : les cases écrivent les
// VRAIES données (profile_creators = assignation au modèle, chatters.shift via le lien
// MyPuls), jamais une copie — Membres/Chatters et le board restent une seule vérité.
// Édition ADMIN uniquement (v1) : réassigner un modèle change le périmètre RLS du chatteur,
// même pouvoir que le dialog Membres admin. Client service-role, garde en tête de handler.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
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
      const { creatorId, shift, chatterIds, previousIds } = values
      const admin = createAdminClient()

      const next = new Set(chatterIds)
      const prev = new Set(previousIds)
      const added = chatterIds.filter((id) => !prev.has(id))
      const removed = previousIds.filter((id) => !next.has(id))
      if (!added.length && !removed.length) return

      // Liens MyPuls des membres touchés (pour poser/lire le shift).
      const touched = [...new Set([...added, ...removed])]
      const { data: members, error: mErr } = await admin
        .from('profiles')
        .select('id, chatter_id')
        .in('id', touched)
        .eq('role', 'chatteur')
      if (mErr) throw new Error(mErr.message)
      const linkOf = new Map((members ?? []).map((m) => [m.id, m.chatter_id]))

      for (const id of added) {
        if (!linkOf.has(id)) continue // pas un membre chatteur : ignoré
        const { error } = await admin
          .from('profile_creators')
          .upsert({ profile_id: id, creator_id: creatorId }, { onConflict: 'profile_id,creator_id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        const link = linkOf.get(id)
        if (link) {
          const { error: sErr } = await admin.from('chatters').update({ shift }).eq('id', link)
          if (sErr) throw new Error(sErr.message)
        }
      }

      for (const id of removed) {
        const link = linkOf.get(id)
        if (!link) continue
        // Shift ACTUEL relu en base : si l'autre case l'a déjà déplacé, ce retrait est un no-op.
        const { data: ch, error: rErr } = await admin.from('chatters').select('shift').eq('id', link).maybeSingle()
        if (rErr) throw new Error(rErr.message)
        if (ch?.shift !== shift) continue
        const { error } = await admin
          .from('profile_creators')
          .delete()
          .eq('profile_id', id)
          .eq('creator_id', creatorId)
        if (error) throw new Error(error.message)
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
      const admin = createAdminClient()
      const { ownerId, creatorId, prevOwnerId, prevCreatorId } = values
      // Le porteur doit être un encadrant (manager/sous-manager) — jamais un chatteur.
      const { data: owner, error: oErr } = await admin
        .from('profiles')
        .select('role')
        .eq('id', ownerId)
        .maybeSingle()
      if (oErr) throw new Error(oErr.message)
      if (!owner || (owner.role !== 'manager' && owner.role !== 'sous-manager'))
        throw new BusinessError('Le porteur d’une ligne doit être un manager ou un sous-manager')
      if (prevOwnerId && prevCreatorId) {
        const { error } = await admin
          .from('profile_creators')
          .delete()
          .eq('profile_id', prevOwnerId)
          .eq('creator_id', prevCreatorId)
        if (error) throw new Error(error.message)
      }
      const { error } = await admin
        .from('profile_creators')
        .upsert({ profile_id: ownerId, creator_id: creatorId }, { onConflict: 'profile_id,creator_id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}

const deleteRowInput = z.object({ ownerId: z.uuid(), creatorId: z.uuid() })

/** Supprime une LIGNE : l'encadrant perd l'assignation du modèle (les chatters ne bougent pas —
 *  le modèle réapparaît en « sans équipe » s'il ne reste couvert par personne). */
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
  fromManagerId: z.uuid(),
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
      if (to?.role !== 'manager') throw new BusinessError('La cible doit être un manager')
      const next = [...new Set([...(sm.manager_ids ?? []).filter((m) => m !== fromManagerId), toManagerId])]
      const { error } = await admin.from('profiles').update({ manager_ids: next }).eq('id', sousManagerId)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/organisation')
      revalidatePath('/chatter/members')
    },
  })
}
