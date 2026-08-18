// Helpers partagés par actions.ts / actions-lifecycle.ts — module SANS 'use server' : un fichier
// 'use server' ne peut exporter que des fonctions async ; ces helpers ne sont jamais appelés
// depuis le client.

import { revalidatePath } from 'next/cache'
import { BusinessError, requirePageProfile } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { createClient } from '@/lib/supabase/server'

/** Droit Entraînement + pas en « en tant que » — une seule requête profil. */
export async function requireTrainee() {
  const profile = await requirePageProfile('frm-entrainement')
  if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
  return profile
}

/** `requireTrainee` + la session doit appartenir à l'appelant (RLS + vérif explicite). */
export async function requireOwnSession(sessionId: string) {
  const profile = await requireTrainee()
  const supabase = await createClient()
  const { data: s, error } = await supabase
    .from('training_sessions')
    .select('id, profile_id, status, ended_at, case_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!s || s.profile_id !== profile.id) throw new BusinessError('Session introuvable')
  return { supabase, s, profile }
}

export const revalidateSession = (id: string) => {
  revalidatePath(`/formation/session/${id}`)
  revalidatePath('/formation/ma-formation')
}
