'use server'

// Server Actions du pôle marketing — écritures via supabase-js (RLS : has_page('marketing'),
// un admin passe toujours). Standard runAction (docs/guidelines-standard-feature.md §4) : la
// garde d'entrée vit dans `guard`, retour d'erreur — jamais `requireAdmin` (son redirect
// serait avalé par le try/catch de runAction, cf. self-review batch 3).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'

const linkTypeInput = z.object({
  linkId: z.uuid(),
  type: z.enum(['twitter', 'instagram', 'telegram', 'other']),
})

/** Garde ADMIN : la correction manuelle du type impacte l'attribution du CA par canal. */
async function adminGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile()
  return profile?.role === 'admin' ? { ok: true } : { ok: false, error: 'Accès réservé à l’admin' }
}

/** Correction manuelle du type d'un lien (équivalent des link_type_overrides legacy). */
export async function setLinkType(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: linkTypeInput,
    input: raw,
    guard: adminGuard,
    handler: async ({ linkId, type }) => {
      const supabase = await createClient()
      const { error } = await supabase.from('mkt_links').update({ type }).eq('id', linkId)
      if (error) throw new Error(error.message)
      revalidatePath('/marketing/liens')
    },
  })
}
