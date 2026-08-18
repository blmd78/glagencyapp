'use server'

// Server Action de l'entraînement — envoyer un message dans une session. Garde : droit Entraînement
// (frm-entrainement), propriétaire de la session (RLS + vérif explicite), refus en impersonation.
// Le fan (IA) est appelé ici, sans streaming (approche A) ; les secrets sont lus en service-role par
// lib/services/training-engine ; chaque appel IA est tracé.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { FAN_MODEL } from '@/lib/ai/client'
import { replyAsFan } from '@/lib/ai/fan'
import { logAiCall } from '@/lib/ai/log'
import { buildFanSystem, dueAtFrom, revealDelayMs } from '@/lib/services/training-engine'
import { createClient } from '@/lib/supabase/server'
import type { CaseKind, CaseSnapshot, MessageSpeaker } from '@/lib/types/training'
import { requireTrainee } from './actions-shared'
import { sendInput } from './schema'
import type { SendResult, SessionMessage } from './types'

/**
 * Le chatter envoie un message (texte ou média verrouillé) ; le fan répond (Haiku). Chrono vérifié
 * CÔTÉ SERVEUR (solo 60 s, défi/boss reaction_max_s) ; faute grave `[[ELIM:code]]` → thread perdu
 * (solo → session `failed`). Défi/boss : la réponse est stockée avec `visible_at` différé.
 */
export async function sendMessage(raw: unknown): Promise<ActionResult<SendResult>> {
  return runAction({
    schema: sendInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const profile = await requireTrainee()
      const supabase = await createClient()
      const admin = createAdminClient()
      const { data: t, error } = await supabase
        .from('training_threads')
        .select('id, session_id, status, turns_used, max_turns, next_due_at, ref_case_id, boss_fan_id, fan_name, training_sessions!inner(id, profile_id, kind, status, case_id, case_snapshot)')
        .eq('id', d.threadId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const s = t?.training_sessions
      if (!t || !s || s.profile_id !== profile.id) throw new BusinessError('Session introuvable')
      if (s.status !== 'active') throw new BusinessError('Cette session est terminée')
      if (t.status !== 'open') throw new BusinessError('Cette conversation est terminée')
      if (t.turns_used >= t.max_turns) throw new BusinessError('Plus de tours disponibles dans cette conversation')
      const kind = s.kind as CaseKind
      const snap = s.case_snapshot as unknown as CaseSnapshot
      const now = new Date()

      // Chrono (autorité serveur) : trop tard → thread perdu, solo → session ratée.
      if (t.next_due_at && now.getTime() > new Date(t.next_due_at).getTime()) {
        const { error: lErr } = await supabase
          .from('training_threads')
          .update({ status: 'lost', lost_reason: 'timeout', next_due_at: null })
          .eq('id', t.id)
        if (lErr) throw new Error(lErr.message)
        if (kind === 'solo') {
          const { error: fErr } = await supabase
            .from('training_sessions')
            .update({ status: 'failed', ended_at: now.toISOString() })
            .eq('id', s.id)
          if (fErr) throw new Error(fErr.message)
        }
        revalidatePath(`/formation/session/${s.id}`)
        throw new BusinessError('Trop lent — ce fan est parti')
      }

      const { data: history, error: hErr } = await supabase
        .from('training_messages')
        .select('id, position, speaker, body, media_price')
        .eq('thread_id', t.id)
        .order('position')
      if (hErr) throw new Error(hErr.message)
      const nextPos = (history?.[history.length - 1]?.position ?? -1) + 1
      // Un média verrouillé est un message À PART ENTIÈRE : le texte éventuel est ignoré
      // (l'UI n'envoie que le média), le corps stocké décrit le média (check SQL : body non vide).
      const body = d.mediaPrice != null ? `Média verrouillé — ${d.mediaPrice} €` : d.body
      const { data: mine, error: iErr } = await supabase
        .from('training_messages')
        .insert({ session_id: s.id, thread_id: t.id, position: nextPos, speaker: 'chatter', body, media_price: d.mediaPrice, visible_at: now.toISOString() })
        .select('id, position, visible_at')
        .single()
      if (iErr) throw new Error(iErr.message)
      const chatter: SessionMessage = { id: mine.id, threadId: t.id, position: mine.position, speaker: 'chatter', body, mediaPrice: d.mediaPrice, visibleAt: mine.visible_at }

      // Le fan (IA). Échec réseau/API → message métier, le message du chatter reste (le tour n'est pas consommé).
      const system = await buildFanSystem(admin, { kind, caseId: s.case_id, refCaseId: t.ref_case_id, bossFanId: t.boss_fan_id, fanName: t.fan_name, isSale: snap.isSale })
      const hist = [
        ...(history ?? []).map((m) => ({ speaker: m.speaker as MessageSpeaker, body: m.body, mediaPrice: m.media_price })),
        { speaker: 'chatter' as const, body, mediaPrice: d.mediaPrice },
      ]
      let reply
      try {
        reply = await replyAsFan({ system, history: hist, maxTokens: kind === 'boss' ? 260 : 200 })
      } catch (err) {
        await logAiCall(admin, { sessionId: s.id, threadId: t.id, kind: 'fan', model: FAN_MODEL, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, latencyMs: 0, ok: false })
        console.error('[training fan]', err)
        throw new BusinessError('Le fan n’a pas répondu — réessaie')
      }
      await logAiCall(admin, { sessionId: s.id, threadId: t.id, kind: 'fan', model: reply.model, usage: reply.usage, latencyMs: reply.latencyMs, ok: reply.ok })

      // `body` du fan borné à 1000 (check SQL) ; jamais vide (fan.ts retombe sur '😒').
      const fanBody = reply.text.slice(0, 1000)
      const visibleAt = new Date(now.getTime() + revealDelayMs(kind))
      const { data: fanRow, error: fErr } = await supabase
        .from('training_messages')
        .insert({ session_id: s.id, thread_id: t.id, position: nextPos + 1, speaker: 'fan', body: fanBody, visible_at: visibleAt.toISOString() })
        .select('id, position, visible_at')
        .single()
      if (fErr) throw new Error(fErr.message)
      const fan: SessionMessage = { id: fanRow.id, threadId: t.id, position: fanRow.position, speaker: 'fan', body: fanBody, mediaPrice: null, visibleAt: fanRow.visible_at }

      const turnsUsed = t.turns_used + 1
      const lost = reply.faultCode !== null
      const done = !lost && turnsUsed >= t.max_turns
      const status = lost ? 'lost' : done ? 'done' : 'open'
      const nextDueAt = status === 'open' ? dueAtFrom(visibleAt, kind, snap.reactionMaxS).toISOString() : null
      const { error: uErr } = await supabase
        .from('training_threads')
        .update({ turns_used: turnsUsed, status, lost_reason: lost ? reply.faultCode : null, next_due_at: nextDueAt })
        .eq('id', t.id)
      if (uErr) throw new Error(uErr.message)

      // Fin de session ? solo perdu → failed ; tous les threads finis → ended_at (la notation suit).
      let sessionStatus: SendResult['sessionStatus'] = 'active'
      let sessionEnded = false
      if (kind === 'solo' && lost) {
        const { error: sErr } = await supabase.from('training_sessions').update({ status: 'failed', ended_at: now.toISOString() }).eq('id', s.id)
        if (sErr) throw new Error(sErr.message)
        sessionStatus = 'failed'
        sessionEnded = true
      } else {
        const { data: open, error: oErr } = await supabase.from('training_threads').select('id').eq('session_id', s.id).eq('status', 'open').limit(1)
        if (oErr) throw new Error(oErr.message)
        if (!open?.length) {
          const { error: eErr } = await supabase.from('training_sessions').update({ ended_at: now.toISOString() }).eq('id', s.id)
          if (eErr) throw new Error(eErr.message)
          sessionEnded = true
        }
      }
      revalidatePath(`/formation/session/${s.id}`)
      return { chatter, fan, thread: { status, lostReason: lost ? reply.faultCode : null, turnsUsed, nextDueAt }, sessionStatus, sessionEnded, serverNow: new Date().toISOString() }
    },
  })
}
