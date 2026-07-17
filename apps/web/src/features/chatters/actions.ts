'use server'

// Server Action d'édition des champs closing d'un chatteur — supabase-js + RLS.
// Droit : admin ou page `chatters` (aligné sur la policy chatters_crm_update, 0029).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, pageGuard, type ActionResult } from '@/lib/actions'
import { updateChatterCrmInput } from './schema'

export async function updateChatterCrm(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateChatterCrmInput,
    input: raw,
    guard: pageGuard('chatters'),
    handler: async (values) => {
      const supabase = await createClient()
      const { error } = await supabase
        .from('chatters')
        .update({ role: values.role, team: values.team, shift: values.shift })
        .eq('id', values.chatterId)
      // Erreur technique → throw : runAction capture (Sentry) + message générique.
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/chatters')
    },
  })
}
