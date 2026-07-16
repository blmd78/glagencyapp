'use server'

// Server Action Infos modèles — écriture ADMIN (RLS creators_admin_update en ceinture,
// GRANT colonne infos_cle ouvert par la migration 0047). Zod ci-dessous non partagé côté
// client (EditDialog appelle l'action directement, pas de zodResolver) → reste inline
// (même choix que features/quotas et features/snap-codes, docs/guidelines-standard-feature.md §5).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Json } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'

const saveInfosModeleInput = z.object({
  creatorId: z.uuid(),
  base: z.record(z.string(), z.string().max(300)),
  sections: z
    .array(
      z.object({
        titre: z.string().max(120),
        contenu: z.string().max(5000),
        emoji: z.string().max(16).optional(),
        type: z.enum(['liste', 'fiche', 'recits', 'texte']).optional(),
      }),
    )
    .max(30),
})

export async function saveInfosModele(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: saveInfosModeleInput,
    input: raw,
    guard: async () => {
      const profile = await getProfile()
      return profile?.role === 'admin' ? { ok: true } : { ok: false, error: 'Réservé aux admins' }
    },
    handler: async ({ creatorId, base, sections }) => {
      const supabase = await createClient()
      const { error } = await supabase
        .from('creators')
        // `infos_cle` est typé `Json | null` (généré, migration 0047) : cast ciblé du
        // PAYLOAD vers `Json` (pas `as never`) — le payload local (base/sections typés)
        // n'a pas de signature d'index explicite, requise par l'union récursive Json
        // (docs/guidelines-data-loading.md §1).
        .update({ infos_cle: { base, sections } as Json })
        .eq('id', creatorId)
      // Erreur technique → throw : runAction capture (Sentry) + message générique.
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/infos-modeles')
    },
  })
}
