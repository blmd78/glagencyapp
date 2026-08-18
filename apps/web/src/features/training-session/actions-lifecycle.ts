'use server'

// Fin de session / notation / chrono écoulé / signalement. Même garde que actions.ts (droit
// Entraînement, propriétaire, pas d'impersonation — helpers dans actions-shared.ts). La notation
// vit dans lib/services/training-scoring (partagée avec le rescore admin de l'Overview).

import { revalidatePath } from 'next/cache'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { scoreSessionById } from '@/lib/services/training-scoring'
import { createClient } from '@/lib/supabase/server'
import { requireOwnSession, requireTrainee, revalidateSession } from './actions-shared'
import { reportInput, sessionIdInput, threadIdInput } from './schema'

/** « Terminer » : ferme les threads ouverts (done), pose ended_at — la notation est appelée ensuite par le client. */
export async function endSession(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sessionIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId }) => {
      const { supabase, s } = await requireOwnSession(sessionId)
      if (s.status !== 'active') throw new BusinessError('Cette session est déjà terminée')
      const { error: tErr } = await supabase
        .from('training_threads')
        .update({ status: 'done', next_due_at: null })
        .eq('session_id', sessionId)
        .eq('status', 'open')
      if (tErr) throw new Error(tErr.message)
      if (!s.ended_at) {
        const { error } = await supabase.from('training_sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
        if (error) throw new Error(error.message)
      }
      revalidateSession(sessionId)
    },
  })
}

/** « Abandonner » : session non notée, libère le slot « une seule active ». */
export async function abandonSession(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sessionIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId }) => {
      const { supabase, s } = await requireOwnSession(sessionId)
      if (s.status !== 'active') throw new BusinessError('Cette session est déjà terminée')
      const { error } = await supabase
        .from('training_sessions')
        .update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (error) throw new Error(error.message)
      const { error: tErr } = await supabase.from('training_threads').update({ next_due_at: null }).eq('session_id', sessionId)
      if (tErr) throw new Error(tErr.message)
      revalidateSession(sessionId)
    },
  })
}

/** Note la session terminée (un appel IA par thread joué). Relançable en cas d'échec. */
export async function scoreSession(raw: unknown): Promise<ActionResult<{ total: number }>> {
  return runAction({
    schema: sessionIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId }) => {
      const { s } = await requireOwnSession(sessionId)
      if (s.status !== 'active' || !s.ended_at) throw new BusinessError('Termine la session avant de la faire noter')
      let res: { total: number }
      try {
        res = await scoreSessionById(sessionId)
      } catch (err) {
        console.error('[training score]', err)
        throw new BusinessError('La notation a échoué — relance-la dans un instant')
      }
      revalidateSession(sessionId)
      revalidatePath('/formation/modules', 'layout')
      return res
    },
  })
}

/**
 * Chrono écoulé côté client : le serveur VÉRIFIE (next_due_at dépassé, 2 s de grâce) puis marque le
 * thread perdu (`timeout`) ; solo → session `failed` ; défi/boss : plus aucun thread ouvert → ended_at.
 */
export async function timeoutThread(raw: unknown): Promise<ActionResult<{ sessionStatus: string; sessionEnded: boolean }>> {
  return runAction({
    schema: threadIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ threadId }) => {
      const profile = await requireTrainee()
      const supabase = await createClient()
      const { data: t, error } = await supabase
        .from('training_threads')
        .select('id, session_id, status, next_due_at, training_sessions!inner(id, profile_id, kind, status)')
        .eq('id', threadId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const s = t?.training_sessions
      if (!t || !s || s.profile_id !== profile.id) throw new BusinessError('Session introuvable')
      if (s.status !== 'active') return { sessionStatus: s.status, sessionEnded: true }
      if (t.status !== 'open') return { sessionStatus: s.status, sessionEnded: false }
      if (!t.next_due_at || Date.now() < new Date(t.next_due_at).getTime() - 2000) throw new BusinessError('Le temps n’est pas écoulé')
      const now = new Date().toISOString()
      const { error: lErr } = await supabase
        .from('training_threads')
        .update({ status: 'lost', lost_reason: 'timeout', next_due_at: null })
        .eq('id', t.id)
      if (lErr) throw new Error(lErr.message)
      let sessionStatus = 'active'
      let sessionEnded = false
      if (s.kind === 'solo') {
        const { error: fErr } = await supabase.from('training_sessions').update({ status: 'failed', ended_at: now }).eq('id', s.id)
        if (fErr) throw new Error(fErr.message)
        sessionStatus = 'failed'
        sessionEnded = true
      } else {
        const { data: open, error: oErr } = await supabase.from('training_threads').select('id').eq('session_id', s.id).eq('status', 'open').limit(1)
        if (oErr) throw new Error(oErr.message)
        if (!open?.length) {
          const { error: eErr } = await supabase.from('training_sessions').update({ ended_at: now }).eq('id', s.id)
          if (eErr) throw new Error(eErr.message)
          sessionEnded = true
        }
      }
      revalidateSession(s.id)
      return { sessionStatus, sessionEnded }
    },
  })
}

/** Signaler une note contestée (une fois par session). */
export async function reportScore(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: reportInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId, message }) => {
      const { supabase, s, profile } = await requireOwnSession(sessionId)
      if (s.status !== 'scored') throw new BusinessError('On ne signale qu’une session notée')
      const { data: existing, error: eErr } = await supabase.from('training_reports').select('id').eq('session_id', sessionId).maybeSingle()
      if (eErr) throw new Error(eErr.message)
      if (existing) throw new BusinessError('Cette note est déjà signalée')
      const { error } = await supabase.from('training_reports').insert({ session_id: sessionId, profile_id: profile.id, message })
      if (error) throw new Error(error.message)
      revalidateSession(sessionId)
      revalidatePath('/formation/overview')
    },
  })
}
