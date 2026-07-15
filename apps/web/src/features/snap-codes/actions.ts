'use server'

// Server Actions Codes Snap — écriture ADMIN (RLS snap_codes admin-only en ceinture).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { encryptSecret } from '@/lib/snap-crypto'
import { SNAP_STATUTS } from './types'

type Result = { success: true } | { success: false; error: string }

const input = z.object({
  creatorId: z.string().uuid(),
  pseudo: z.string().max(120),
  mdp: z.string().max(120),
  statut: z.enum(SNAP_STATUTS),
  notes: z.string().max(500),
})

/** Upsert de la ligne complète (1 par modèle) — appelé en autosave depuis le tableau. */
export async function saveSnapCode(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Réservé aux admins' }
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data

  let mdpChiffre: string
  try {
    // Chiffré au repos (AES-256-GCM, clé en env) : un dump de la base ne révèle rien.
    mdpChiffre = encryptSecret(d.mdp)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('snap_codes' as never).upsert(
    {
      creator_id: d.creatorId,
      pseudo: d.pseudo,
      mdp: mdpChiffre,
      statut: d.statut,
      notes: d.notes,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'creator_id' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/codes-snap')
  return { success: true }
}
