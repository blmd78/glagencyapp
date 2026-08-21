// Helpers partagés par actions.ts / actions-lifecycle.ts — module SANS 'use server' : un fichier
// 'use server' ne peut exporter que des fonctions async ; ces helpers ne sont jamais appelés
// depuis le client.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, requirePageProfileLive } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

/**
 * `requirePageProfileLive('frm-entrainement')` (droit Entraînement + refus en « en tant que ») +
 * la session doit appartenir à l'appelant. Depuis 0121 la RLS de
 * `training_sessions` est en LECTURE SEULE : cette vérification explicite (`profile_id` lu avec le
 * client utilisateur) est ce qui autorise les écritures service-role qui suivent — elle doit
 * toujours précéder le moindre `admin.from(...)`.
 */
export async function requireOwnSession(sessionId: string) {
  const profile = await requirePageProfileLive('frm-entrainement')
  const supabase = await createClient()
  const { data: s, error } = await supabase
    .from('training_sessions')
    .select('id, profile_id, status, ended_at, case_id, kind')
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
 * Rend `true` dès qu'aucun thread n'est ouvert — qu'on vienne de poser `ended_at` ou qu'il l'ait
 * déjà été : l'état rendu au client est « session terminée », pas « je l'ai fermée ».
 * `.is('ended_at', null)` rend l'écriture IDEMPOTENTE : un appel tardif (deuxième onglet, retry)
 * ne repousse jamais l'heure de fin déjà enregistrée.
 * Lecture avec le client de l'appelant (RLS), écriture en service-role (0121) — les trois appelants
 * ont vérifié la propriété de `sessionId` juste avant.
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
  const { error: eErr } = await createAdminClient()
    .from('training_sessions')
    .update({ ended_at: nowIso })
    .eq('id', sessionId)
    .is('ended_at', null)
  if (eErr) throw new Error(eErr.message)
  return true
}

export const revalidateSession = (id: string) => {
  revalidatePath(`/formation/session/${id}`)
  revalidatePath('/formation/ma-formation')
}
