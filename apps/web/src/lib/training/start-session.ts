'use server'

// Démarrer (ou reprendre) une session d'entraînement — PARTAGÉ hors feature (Modules « Jouer »,
// session « Rejouer », Ma formation « Continuer ») : la frontière ESLint interdit le cross-feature,
// d'où lib/ (précédent : lib/impersonation/actions.ts). Garde : droit Entraînement (frm-entrainement),
// refus en impersonation. Aucun appel IA ici (les ouvertures sont scriptées).
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (0121 : plus aucune policy
// d'écriture `authenticated` sur sessions/threads/messages) — `profile_id` vaut toujours celui du
// profil rendu par la garde ci-dessous, jamais une valeur venue de l'entrée.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { bossUnlocked } from '@glagency/core'
import { createAdminClient, type Json } from '@glagency/db'
import { runAction, noGuard, requirePageProfileLive, BusinessError, type ActionResult } from '@/lib/actions'
import { dueAtFrom } from '@/lib/services/training-engine'
import { createClient } from '@/lib/supabase/server'
import { ARENA_OPENING_OFFSETS_S, type CaseKind, type CaseSnapshot, type MessageSpeaker } from '@/lib/types/training'

const startInput = z.object({ caseId: z.uuid() })

const iso = (d: Date) => d.toISOString()
/** Ouvertures scriptées : `creator` en base (0113) = la créatrice, jouée par le chatter. */
const speakerOf = (s: string): MessageSpeaker => (s === 'fan' ? 'fan' : 'chatter')

/**
 * Démarre une session sur un cas (ou reprend l'ACTIVE du chatter : une seule à la fois).
 * Boss verrouillé sous 60/100 de moyenne. Crée session (snapshot visible) + threads + messages
 * d'ouverture (défi/boss : ouvertures échelonnées 0/20/45/75/110 s ; chrono armé si l'ouverture
 * finit par le fan).
 */
export async function startSession(raw: unknown): Promise<ActionResult<{ sessionId: string; resumed: boolean }>> {
  return runAction({
    schema: startInput,
    input: raw,
    guard: noGuard,
    handler: async ({ caseId }) => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const supabase = await createClient()
      const admin = createAdminClient()
      const { data: active, error: aErr } = await supabase
        .from('training_sessions')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .maybeSingle()
      if (aErr) throw new Error(aErr.message)
      if (active) return { sessionId: active.id, resumed: true }

      const { data: c, error } = await supabase
        .from('training_cases')
        // Un seul littéral : supabase-js type les embeds depuis le littéral exact.
        .select(
          'id, module_id, code, kind, title, phase, difficulty, max_turns, reaction_max_s, is_sale, context, objective, target_line, fan_name, active, training_modules(code, title, objective_label, active), training_case_messages(position, speaker, body), training_case_arena_slots!case_id(position, ref_case_id, display_name), training_case_boss_fans(id, name, position, opening_message)',
        )
        .eq('id', caseId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!c || !c.active || !c.training_modules.active) throw new BusinessError('Ce cas n’est plus disponible')
      const kind = c.kind as CaseKind
      if (kind === 'boss') {
        const { data: st, error: sErr } = await supabase
          .from('training_profile_stats')
          .select('avg_total')
          .eq('profile_id', profile.id)
          .maybeSingle()
        if (sErr) throw new Error(sErr.message)
        if (!bossUnlocked(st?.avg_total == null ? null : Number(st.avg_total))) {
          throw new BusinessError(
            `Le boss final se débloque à 60/100 de moyenne — ta moyenne : ${st?.avg_total == null ? '—' : Math.round(Number(st.avg_total))}/100`,
          )
        }
      }
      // AJOUT vs brief : un défi sans slot / un boss sans fan produirait une session ACTIVE sans
      // aucun thread — injouable ET bloquante (une seule session active à la fois). Vérifié AVANT
      // l'insert, donc sans session orpheline.
      if (kind === 'arena' && !c.training_case_arena_slots.length) throw new BusinessError('Ce défi n’a aucune conversation configurée — préviens un admin')
      if (kind === 'boss' && !c.training_case_boss_fans.length) throw new BusinessError('Ce boss n’a aucun fan configuré — préviens un admin')

      const snapshot: CaseSnapshot = {
        code: c.code,
        title: c.title,
        phase: c.phase,
        difficulty: c.difficulty,
        context: c.context,
        objective: c.objective,
        objectiveLabel: c.training_modules.objective_label,
        targetLine: c.target_line,
        maxTurns: c.max_turns,
        reactionMaxS: c.reaction_max_s,
        isSale: c.is_sale,
        moduleTitle: c.training_modules.title,
        moduleCode: c.training_modules.code,
      }
      const { data: session, error: iErr } = await admin
        .from('training_sessions')
        // `case_snapshot` est une colonne jsonb → typée `Json` (union récursive) : un objet
        // d'interface ne lui est pas assignable directement (index signature absente).
        .insert({ profile_id: profile.id, case_id: c.id, module_id: c.module_id, kind, case_snapshot: snapshot as unknown as Json })
        .select('id')
        .single()
      if (iErr) {
        if (iErr.code === '23505') {
          // course : une session active vient d'être créée
          const { data: again } = await supabase
            .from('training_sessions')
            .select('id')
            .eq('profile_id', profile.id)
            .eq('status', 'active')
            .maybeSingle()
          if (again) return { sessionId: again.id, resumed: true }
        }
        throw new Error(iErr.message)
      }
      const now = new Date()

      // Threads + ouvertures selon la sorte.
      type Opening = { speaker: MessageSpeaker; body: string }
      type Plan = { position: number; fanName: string; refCaseId: string | null; bossFanId: string | null; maxTurns: number; openings: Opening[]; offsetS: number }
      let plan: Plan[] = []
      if (kind === 'solo') {
        plan = [
          {
            position: 0,
            fanName: c.fan_name ?? 'Fan',
            refCaseId: null,
            bossFanId: null,
            maxTurns: c.max_turns,
            openings: [...c.training_case_messages].sort((a, b) => a.position - b.position).map((m) => ({ speaker: speakerOf(m.speaker), body: m.body })),
            offsetS: 0,
          },
        ]
      } else if (kind === 'arena') {
        const slots = [...c.training_case_arena_slots].sort((a, b) => a.position - b.position)
        const { data: refMsgs, error: rErr } = await supabase
          .from('training_case_messages')
          .select('case_id, position, speaker, body')
          .in('case_id', slots.map((s) => s.ref_case_id))
          .order('position')
        if (rErr) throw new Error(rErr.message)
        plan = slots.map((s, i) => ({
          position: i,
          fanName: s.display_name,
          refCaseId: s.ref_case_id,
          bossFanId: null,
          maxTurns: c.max_turns,
          openings: (refMsgs ?? []).filter((m) => m.case_id === s.ref_case_id).map((m) => ({ speaker: speakerOf(m.speaker), body: m.body })),
          offsetS: ARENA_OPENING_OFFSETS_S[i] ?? 0,
        }))
      } else {
        plan = [...c.training_case_boss_fans].sort((a, b) => a.position - b.position).map((f, i) => ({
          position: i,
          fanName: f.name,
          refCaseId: null,
          bossFanId: f.id,
          maxTurns: c.max_turns,
          openings: [{ speaker: 'fan' as const, body: f.opening_message }],
          offsetS: ARENA_OPENING_OFFSETS_S[i] ?? 0,
        }))
      }
      const { data: threads, error: tErr } = await admin
        .from('training_threads')
        .insert(plan.map((p) => ({ session_id: session.id, position: p.position, fan_name: p.fanName, ref_case_id: p.refCaseId, boss_fan_id: p.bossFanId, max_turns: p.maxTurns })))
        .select('id, position')
      if (tErr) throw new Error(tErr.message)
      const threadIdAt = new Map(threads.map((t) => [t.position, t.id]))
      const rows: { session_id: string; thread_id: string; position: number; speaker: MessageSpeaker; body: string; visible_at: string }[] = []
      const dueUpdates: { id: string; next_due_at: string }[] = []
      for (const p of plan) {
        const threadId = threadIdAt.get(p.position)
        if (!threadId) throw new Error('thread créé introuvable')
        const visibleAt = new Date(now.getTime() + p.offsetS * 1000)
        p.openings.forEach((m, i) =>
          rows.push({ session_id: session.id, thread_id: threadId, position: i, speaker: m.speaker, body: m.body, visible_at: iso(visibleAt) }),
        )
        const last = p.openings[p.openings.length - 1]
        if (last?.speaker === 'fan') dueUpdates.push({ id: threadId, next_due_at: iso(dueAtFrom(visibleAt, kind, c.reaction_max_s)) })
      }
      if (rows.length) {
        const { error: mErr } = await admin.from('training_messages').insert(rows)
        if (mErr) throw new Error(mErr.message)
      }
      for (const u of dueUpdates) {
        const { error: dErr } = await admin.from('training_threads').update({ next_due_at: u.next_due_at }).eq('id', u.id)
        if (dErr) throw new Error(dErr.message)
      }
      revalidatePath('/formation/ma-formation')
      return { sessionId: session.id, resumed: false }
    },
  })
}
