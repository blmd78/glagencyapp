'use server'

// Server Action d'édition des champs closing d'un chatteur — supabase-js + RLS.
// Droit : admin ou manager/sous-manager ayant la page `chatters` (aligné sur la policy
// chatters_crm_update durcie en 0060 — un chatteur est en lecture seule).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, managerPageGuard, type ActionResult } from '@/lib/actions'
import { updateChatterCrmInput } from './schema'

export async function updateChatterCrm(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateChatterCrmInput,
    input: raw,
    guard: managerPageGuard('chatters'),
    handler: async (values) => {
      const supabase = await createClient()
      const { error } = await supabase
        .from('chatters')
        .update({ shift: values.shift })
        .eq('id', values.chatterId)
      // Erreur technique → throw : runAction capture (Sentry) + message générique.
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/chatters')
    },
  })
}
