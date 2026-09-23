'use server'

// Server Actions du pôle marketing — écritures via supabase-js (RLS : has_page('marketing'),
// un admin passe toujours). Standard runAction (docs/guidelines-standard-feature.md §4) : la
// garde d'entrée vit dans `guard`, retour d'erreur — jamais `requireAdmin` (son redirect
// serait avalé par le try/catch de runAction, cf. self-review batch 3).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'

const linkTypeInput = z.object({
  linkId: z.uuid(),
  // Clé LIBRE depuis 0167 : les groupes sont des lignes, une liste figée ici redeviendrait
  // fausse au premier groupe créé. C'est la clé étrangère qui dit le vrai, et sa violation se
  // traduit plus bas en refus lisible.
  type: z.string().trim().min(1).max(60),
})

/** Correction manuelle du type d'un lien (équivalent des link_type_overrides legacy). */
export async function setLinkType(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: linkTypeInput,
    input: raw,
    guard: adminGuard,
    handler: async ({ linkId, type }) => {
      const supabase = await createClient()
      // `type_manual` (0169) : un lien déplacé à la main est ÉPINGLÉ — créer ou modifier un
      // groupe rejoue les règles sur tous les autres liens, jamais sur celui-ci.
      const { error } = await supabase
        .from('mkt_links')
        .update({ type, type_manual: true })
        .eq('id', linkId)
      // 23503 = la clé étrangère `mkt_links_type_fkey` : le groupe a été supprimé entre
      // l'affichage du menu et le clic. Message métier plutôt qu'une 500.
      if (error?.code === '23503') throw new BusinessError('Ce groupe n’existe plus — rafraîchis la page.')
      if (error) throw new Error(error.message)
      revalidatePath('/marketing/liens')
    },
  })
}
