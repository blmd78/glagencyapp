'use server'

// Fin de session / expiration / notation / chrono écoulé / signalement. Même garde que actions.ts
// (droit Entraînement, propriétaire, pas d'impersonation — helpers dans actions-shared.ts). La
// notation vit dans lib/services/training-scoring (partagée avec le rescore admin de l'Overview).
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (0121 : la RLS de
// sessions/threads/messages/signalements est en lecture seule) — toujours après `requireOwnSession`
// (ou la vérif `s.profile_id !== profile.id` de `timeoutThread`).

import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { scoreSessionById } from '@/lib/services/training-scoring'
import { createClient } from '@/lib/supabase/server'
import { closeSessionIfNoOpenThread, requireOwnSession, requireTrainee, revalidateSession } from './actions-shared'
import { reportInput, sessionIdInput, threadIdInput } from './schema'

/** « Terminer » : ferme les threads ouverts, pose ended_at — la notation est appelée ensuite par le client. */
export async function endSession(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sessionIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId }) => {
      const { s } = await requireOwnSession(sessionId)
      if (s.status !== 'active') throw new BusinessError('Cette session est déjà terminée')
      const admin = createAdminClient()
      // Un thread JAMAIS joué (0 tour) ne part pas à la notation : `lost`/`abandon` vaut 0 sans
      // appel IA (scoreSessionById n'appelle le modèle que sur les threads joués) — un défi où le
      // chatter n'a ouvert qu'une conv ne facture pas 4 notations de transcriptions vides.
      const { error: aErr } = await admin
        .from('training_threads')
        .update({ status: 'lost', lost_reason: 'abandon', next_due_at: null })
        .eq('session_id', sessionId)
        .eq('status', 'open')
        .eq('turns_used', 0)
      if (aErr) throw new Error(aErr.message)
      const { error: tErr } = await admin
        .from('training_threads')
        .update({ status: 'done', next_due_at: null })
        .eq('session_id', sessionId)
        .eq('status', 'open')
      if (tErr) throw new Error(tErr.message)
      if (!s.ended_at) {
        const { error } = await admin.from('training_sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
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
      const { s } = await requireOwnSession(sessionId)
      if (s.status !== 'active') throw new BusinessError('Cette session est déjà terminée')
      const admin = createAdminClient()
      const { error } = await admin
        .from('training_sessions')
        .update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (error) throw new Error(error.message)
      const { error: tErr } = await admin.from('training_threads').update({ next_due_at: null }).eq('session_id', sessionId)
      if (tErr) throw new Error(tErr.message)
      revalidateSession(sessionId)
    },
  })
}

/**
 * Spec §5 « Interruption » — défi/boss : le chatter revient alors que TOUS ses chronos sont
 * dépassés. Rien n'a été joué depuis, la session n'a plus de sens : threads ouverts `lost/timeout`,
 * session `abandoned`. Le client la déclenche au chargement (cf. `session-view.tsx`), le serveur
 * revérifie tout — même grâce de 2 s que `timeoutThread` / `sendMessage`.
 * Le solo en est exclu : un seul chrono, déjà traité par `timeoutThread` (→ `failed`).
 */
export async function expireSession(raw: unknown): Promise<ActionResult<{ expired: boolean }>> {
  return runAction({
    schema: sessionIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId }) => {
      const { supabase, s } = await requireOwnSession(sessionId)
      if (s.status !== 'active' || s.kind === 'solo') return { expired: false }
      const { data: threads, error } = await supabase
        .from('training_threads')
        .select('id, next_due_at')
        .eq('session_id', sessionId)
        .eq('status', 'open')
      if (error) throw new Error(error.message)
      if (!threads.length) return { expired: false }
      const cutoff = Date.now() - 2000
      // TOUS les threads ouverts doivent être dépassés : un seul chrono encore valide (ou sans
      // chrono armé — ouverture finissant par le chatter) et la session reste jouable.
      if (!threads.every((t) => t.next_due_at != null && Date.parse(t.next_due_at) < cutoff)) return { expired: false }

      const admin = createAdminClient()
      const now = new Date().toISOString()
      const { error: tErr } = await admin
        .from('training_threads')
        .update({ status: 'lost', lost_reason: 'timeout', next_due_at: null })
        .eq('session_id', sessionId)
        .eq('status', 'open')
      if (tErr) throw new Error(tErr.message)
      const { error: sErr } = await admin
        .from('training_sessions')
        .update({ status: 'abandoned', ended_at: now })
        .eq('id', sessionId)
        .eq('status', 'active')
      if (sErr) throw new Error(sErr.message)
      revalidateSession(sessionId)
      return { expired: true }
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
        // Sentry AVANT le BusinessError : `runAction` ne capture que les erreurs techniques et on
        // rend ici un message métier — même règle que le rescore de l'Overview.
        Sentry.captureException(err)
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
      // Thread déjà fermé (course avec un envoi, ou deux onglets) : rien à marquer, mais on rend
      // l'état RÉEL de la session — un `false` en dur laissait le client sur une session terminée.
      if (t.status !== 'open') {
        return { sessionStatus: s.status, sessionEnded: await closeSessionIfNoOpenThread(supabase, s.id, new Date().toISOString()) }
      }
      if (!t.next_due_at || Date.now() < new Date(t.next_due_at).getTime() - 2000) throw new BusinessError('Le temps n’est pas écoulé')
      const admin = createAdminClient()
      const now = new Date().toISOString()
      const { error: lErr } = await admin
        .from('training_threads')
        .update({ status: 'lost', lost_reason: 'timeout', next_due_at: null })
        .eq('id', t.id)
      if (lErr) throw new Error(lErr.message)
      let sessionStatus = 'active'
      let sessionEnded = false
      if (s.kind === 'solo') {
        const { error: fErr } = await admin.from('training_sessions').update({ status: 'failed', ended_at: now }).eq('id', s.id)
        if (fErr) throw new Error(fErr.message)
        sessionStatus = 'failed'
        sessionEnded = true
      } else {
        sessionEnded = await closeSessionIfNoOpenThread(supabase, s.id, now)
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
      const { error } = await createAdminClient().from('training_reports').insert({ session_id: sessionId, profile_id: profile.id, message })
      // 23505 : deux envois concurrents ont passé la vérification ci-dessus — l'index unique 0121
      // tranche, et le message reste métier.
      if (error?.code === '23505') throw new BusinessError('Cette note est déjà signalée')
      if (error) throw new Error(error.message)
      revalidateSession(sessionId)
      revalidatePath('/formation/overview')
    },
  })
}
