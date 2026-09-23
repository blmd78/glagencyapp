'use server'

// Server Actions de la page Modèles du pôle marketing.
//
// Garde ADMIN comme tous les réglages du pôle (marketing-liens/actions.ts), mais via
// `requireAdminProfileLive` et non `adminGuard` : il faut le profil pour signer la note
// (`updated_by`), et le mode « en tant que » ne doit pas pouvoir écrire au nom de quelqu'un.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requireAdminProfileLive, type ActionResult } from '@/lib/actions'
import { sourceNoteSchema } from './source-note.schema'

/**
 * Enregistre la note d'une source (modèle × réseau). Une note VIDÉE est supprimée plutôt que
 * gardée vide : sinon l'indicateur « note » resterait allumé sur une case blanche.
 */
export async function saveSourceNote(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sourceNoteSchema,
    input: raw,
    guard: noGuard,
    handler: async ({ creatorId, groupKey, body }) => {
      const profile = await requireAdminProfileLive()
      const supabase = await createClient()
      const { error } =
        body.trim() === ''
          ? await supabase.from('mkt_source_notes').delete().eq('creator_id', creatorId).eq('group_key', groupKey)
          : await supabase.from('mkt_source_notes').upsert(
              {
                creator_id: creatorId,
                group_key: groupKey,
                body,
                updated_at: new Date().toISOString(),
                updated_by: profile.id,
              },
              { onConflict: 'creator_id,group_key' },
            )
      if (error) throw new Error(error.message)
      revalidatePath('/marketing/modeles')
    },
  })
}
