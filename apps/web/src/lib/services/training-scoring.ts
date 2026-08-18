import 'server-only'
import { createAdminClient } from '@glagency/db'
import { logAiCall } from '@/lib/ai/log'
import { bossScoreSystemPrompt, formatTranscript, scoreSystemPrompt, type HistoryMessage } from '@/lib/ai/prompts'
import { scoreBossThread, scoreThread, type ScoreResult } from '@/lib/ai/score'
import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'

/**
 * Notation d'une session TERMINÉE : un appel structuré par thread `done` (les `lost` valent 0,
 * sans appel), scores + axes écrits en service-role, total = moyenne des threads, statut `scored`
 * (→ trigger 0118 : bests + stats). `force` (admin, rescore) : réécrit les scores d'une session
 * déjà notée (scored_at change → le trigger recalcule). Idempotent : upsert par thread — un
 * échec en cours peut se relancer.
 */
export async function scoreSessionById(sessionId: string, opts: { force?: boolean } = {}): Promise<{ total: number }> {
  const admin = createAdminClient()
  const { data: s, error } = await admin
    .from('training_sessions')
    .select('id, kind, status, case_id, module_id, ended_at, training_threads(id, position, status, lost_reason, ref_case_id, boss_fan_id, fan_name)')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(error.message)
  if (s.status !== 'active' && !(opts.force && s.status === 'scored')) throw new Error(`session non notable (statut ${s.status})`)
  if (!s.ended_at && !opts.force) throw new Error('session non terminée')
  const kind = s.kind as CaseKind

  const [{ data: msgs, error: mErr }, { data: mod, error: modErr }] = await Promise.all([
    admin.from('training_messages').select('thread_id, position, speaker, body, media_price').eq('session_id', sessionId).order('position'),
    admin.from('training_modules').select('id, training_module_axes(key, name, description, position), training_module_secrets(scoring_notes)').eq('id', s.module_id).single(),
  ])
  if (mErr) throw new Error(mErr.message)
  if (modErr) throw new Error(modErr.message)
  const axes = [...mod.training_module_axes]
    .sort((a, b) => a.position - b.position)
    .map((a) => ({ key: a.key, name: a.name, description: a.description }))
  const modSecrets = Array.isArray(mod.training_module_secrets) ? mod.training_module_secrets[0] : mod.training_module_secrets
  const scoringNotes = modSecrets?.scoring_notes ?? null

  // Contexte de notation par cas (solo : le cas ; défi : chaque solo rejoué), secrets compris.
  const caseIds = kind === 'arena'
    ? [...new Set(s.training_threads.map((t) => t.ref_case_id).filter((x): x is string => !!x))]
    : [s.case_id]
  const { data: cases, error: cErr } = await admin
    .from('training_cases')
    .select('id, context, objective, target_line, training_case_secrets(expected)')
    .in('id', caseIds)
  if (cErr) throw new Error(cErr.message)
  const caseById = new Map(cases.map((c) => [c.id, c]))
  const bossFanIds = s.training_threads.map((t) => t.boss_fan_id).filter((x): x is string => !!x)
  const { data: fans, error: fErr } = bossFanIds.length
    ? await admin.from('training_case_boss_fans').select('id, name, persona, training_boss_fan_secrets(budget_cap, nego_where, meet_when)').in('id', bossFanIds)
    : { data: [], error: null }
  if (fErr) throw new Error(fErr.message)
  const fanById = new Map((fans ?? []).map((f) => [f.id, f]))

  const totals: { total: number; objective: boolean }[] = []
  for (const t of [...s.training_threads].sort((a, b) => a.position - b.position)) {
    let r: ScoreResult
    if (t.status === 'lost') {
      const reason = (t.lost_reason ?? 'timeout') as FaultCode | 'timeout'
      const label = FAULT_LABELS[reason] ?? FAULT_LABELS.timeout
      r = {
        total: 0, objectiveReached: false, capped: false, comment: `${label.title}. ${label.text}`, moments: [], axes: [],
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, latencyMs: 0, model: '',
      }
    } else {
      const history: HistoryMessage[] = (msgs ?? [])
        .filter((m) => m.thread_id === t.id)
        .map((m) => ({ speaker: m.speaker as HistoryMessage['speaker'], body: m.body, mediaPrice: m.media_price }))
      const transcript = formatTranscript(history)
      if (kind === 'boss') {
        const f = t.boss_fan_id ? fanById.get(t.boss_fan_id) : undefined
        if (!f) throw new Error('fan du boss introuvable')
        const sec = Array.isArray(f.training_boss_fan_secrets) ? f.training_boss_fan_secrets[0] : f.training_boss_fan_secrets
        r = await scoreBossThread({
          system: bossScoreSystemPrompt({
            name: f.name, persona: f.persona, budgetCap: sec?.budget_cap ?? null, negoWhere: sec?.nego_where ?? null, meetWhen: sec?.meet_when ?? null,
          }),
          transcript,
        })
      } else {
        const c = caseById.get(kind === 'arena' ? (t.ref_case_id ?? '') : s.case_id)
        if (!c) throw new Error('cas de notation introuvable')
        const sec = Array.isArray(c.training_case_secrets) ? c.training_case_secrets[0] : c.training_case_secrets
        r = await scoreThread({
          system: scoreSystemPrompt({
            scoringNotes, context: c.context, objective: c.objective, targetLine: c.target_line, expected: sec?.expected ?? null, axes,
          }),
          transcript,
          axes,
        })
      }
      await logAiCall(admin, { sessionId, threadId: t.id, kind: 'score', model: r.model, usage: r.usage, latencyMs: r.latencyMs, ok: true })
    }
    const { error: uErr } = await admin.from('training_thread_scores').upsert(
      {
        thread_id: t.id, total: r.total, objective_reached: r.objectiveReached, capped: r.capped, comment: r.comment,
        moments: r.moments, scored_at: new Date().toISOString(),
      },
      { onConflict: 'thread_id' },
    )
    if (uErr) throw new Error(uErr.message)
    const { error: dErr } = await admin.from('training_thread_axis_scores').delete().eq('thread_id', t.id)
    if (dErr) throw new Error(dErr.message)
    if (r.axes.length) {
      const { error: aErr } = await admin
        .from('training_thread_axis_scores')
        .insert(r.axes.map((a) => ({ thread_id: t.id, axis_key: a.key, axis_name: a.name, score: a.score })))
      if (aErr) throw new Error(aErr.message)
    }
    totals.push({ total: r.total, objective: r.objectiveReached })
  }
  const total = totals.length ? Math.round(totals.reduce((n, x) => n + x.total, 0) / totals.length) : 0
  const objective = totals.length > 0 && totals.every((x) => x.objective)
  // status + total + objective + scored_at posés ENSEMBLE : c'est cet UPDATE qui déclenche le
  // trigger 0118 (when new.status = 'scored' and scored_at distinct) → bests + stats à jour.
  const { error: sErr } = await admin
    .from('training_sessions')
    .update({ status: 'scored', total, objective_reached: objective, scored_at: new Date().toISOString(), ended_at: s.ended_at ?? new Date().toISOString() })
    .eq('id', sessionId)
  if (sErr) throw new Error(sErr.message)
  return { total }
}
