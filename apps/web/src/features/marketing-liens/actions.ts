'use server'

// Server Actions du pôle marketing — requireAdmin + zod, écritures via supabase-js
// (RLS : has_page('marketing'), un admin passe toujours).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

type Result = { success: true } | { success: false; error: string }

const linkTypeInput = z.object({
  linkId: z.uuid(),
  type: z.enum(['twitter', 'instagram', 'telegram', 'other']),
})

/** Correction manuelle du type d'un lien (équivalent des link_type_overrides legacy). */
export async function setLinkType(raw: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = linkTypeInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('mkt_links')
    .update({ type: parsed.data.type })
    .eq('id', parsed.data.linkId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/liens')
  return { success: true }
}
