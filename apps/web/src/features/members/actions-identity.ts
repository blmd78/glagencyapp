'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { noGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

/**
 * « Vu » sur une anomalie d'identité (Membres › Fiches MyPuls, spec § 7). Admin seul, hors
 * consultation « en tant que » : garde UNE fois dans le handler (`noGuard`, §4). La RLS
 * (`chatter_identity_issues_admin_ack`, 0183) reste l'enforcement réel. Une anomalie vue ne revient
 * pas : l'ingestion met à jour `last_seen_at` sans toucher `resolved_at`.
 */
export async function ackIdentityIssue(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.object({ id: z.uuid() }),
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const profile = await requireAdminProfileLive()
      const supabase = await createClient()
      const { error } = await supabase
        .from('chatter_identity_issues')
        .update({ resolved_at: new Date().toISOString(), resolved_by: profile.id })
        .eq('id', id)
        .is('resolved_at', null)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/members')
    },
  })
}
