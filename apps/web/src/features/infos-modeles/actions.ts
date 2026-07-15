'use server'

// Server Action Infos modèles — écriture ADMIN (RLS creators_admin_update en ceinture,
// GRANT colonne infos_cle ouvert par la migration 0041).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'

type Result = { success: true } | { success: false; error: string }

const input = z.object({
  creatorId: z.string().uuid(),
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

export async function saveInfosModele(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Réservé aux admins' }
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { creatorId, base, sections } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('creators')
    .update({ infos_cle: { base, sections } } as never)
    .eq('id', creatorId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/infos-modeles')
  return { success: true }
}
