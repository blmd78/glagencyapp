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
import { runAction, noGuard, requireAdminProfile, type ActionResult } from '@/lib/actions'
import { ORG_STATUSES } from './types'

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

const statusInput = z.object({
  creatorId: z.uuid(),
  status: z.enum(ORG_STATUSES).nullable(),
})

/** Statut de la ligne modèle (✅/⭐/⚠️ ou aucun) — seule donnée propre au board (0099). */
export async function saveOrgStatus(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: statusInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireAdminProfile()
      const admin = createAdminClient()
      const { error } = await admin.from('org_model_status').upsert({
        creator_id: values.creatorId,
        status: values.status,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/organisation')
    },
  })
}
