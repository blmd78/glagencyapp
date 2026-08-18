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

export type Db = Awaited<ReturnType<typeof createClient>>

/**
 * Défi/boss : dès qu'aucun thread n'est plus `open`, la session est TERMINÉE (`ended_at`) — la
 * notation suit. Une seule implémentation pour les trois chemins qui peuvent fermer le dernier
 * thread : envoi réussi, timeout constaté à l'envoi, chrono écoulé signalé par le client.
 * Rend `true` si la session vient d'être fermée (ou l'était déjà, faute de thread ouvert).
 */
export async function closeSessionIfNoOpenThread(supabase: Db, sessionId: string, nowIso: string): Promise<boolean> {
  const { data: open, error } = await supabase
    .from('training_threads')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'open')
    .limit(1)
  if (error) throw new Error(error.message)
  if (open?.length) return false
  const { error: eErr } = await supabase.from('training_sessions').update({ ended_at: nowIso }).eq('id', sessionId)
  if (eErr) throw new Error(eErr.message)
  return true
}

export const revalidateSession = (id: string) => {
  revalidatePath(`/formation/session/${id}`)
  revalidatePath('/formation/ma-formation')
}
