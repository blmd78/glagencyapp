'use server'

// Correction de l'attribution d'un lien LinkScale (Marketing › Trafic). `manual = true` fige la
// ligne : le relevé nocturne ne la recalcule plus (spec 2026-09-30-trafic-linkscale-design.md).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { LS_PLATFORMS } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { runAction, managerPageGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { toAttributionUpdate } from './attribution'

const attributionSchema = z.object({
  linkId: z.string().uuid(),
  creatorId: z.string().uuid().nullable(),
  platform: z.enum(LS_PLATFORMS),
  socialAccountId: z.string().uuid().nullable(),
  operator: z.string().trim().max(40).nullable(),
})

export async function updateLsAttribution(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: attributionSchema,
    input: raw,
    guard: managerPageGuard('mkt-trafic'),
    handler: async (v) => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('mkt_ls_links')
        .update(toAttributionUpdate(v))
        .eq('id', v.linkId)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new BusinessError('Lien introuvable, ou modification non autorisée.')
      revalidatePath('/marketing/trafic')
    },
  })
}
