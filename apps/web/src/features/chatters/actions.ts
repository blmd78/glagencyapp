'use server'

// Server Action d'édition des champs closing d'un chatteur — supabase-js + RLS.
// Droit : admin ou page `chatters` (aligné sur la policy chatters_crm_update, 0027).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { updateChatterCrmInput } from './schema'

type Result = { success: true } | { success: false; error: string }

export async function updateChatterCrm(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && !profile.pages.includes('chatters')))
    return { success: false, error: 'Accès refusé' }
  const p = updateChatterCrmInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('chatters')
    .update({ role: p.data.role, team: p.data.team, shift: p.data.shift } as never)
    .eq('id', p.data.chatterId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/chatters')
  return { success: true }
}
