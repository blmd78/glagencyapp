import 'server-only'
import { BOSS_PASS } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { SCORE_MODEL } from '@/lib/ai/client'
import { logAiCall } from '@/lib/ai/log'
import { bossScoreSystemPrompt, formatTranscript, scoreSystemPrompt, type HistoryMessage } from '@/lib/ai/prompts'
import { AiCallError, scoreBossThread, scoreThread, type ScoreResult } from '@/lib/ai/score'
import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'

/**
 * Notation d'une session TERMINÉE : un appel structuré par thread `done` (les `lost` valent 0,
 * sans appel), scores + axes écrits en service-role, total = moyenne des threads, statut `scored`
 * (→ trigger : bests + stats). `force` (admin, rescore) : réécrit les scores d'une session déjà
 * notée SANS déplacer `scored_at` — la semaine du classement, qui distribue l'argent de la roue,
 * est bornée dessus (0116). Le trigger se déclenche alors sur le changement de total /
 * objective_reached.
 *
 * Relance après un échec partiel : les threads DÉJÀ notés sont repris tels quels, sans nouvel appel
 * (hors `force`) — et un échec d'appel PERSISTE d'abord les threads dont l'appel a réussi, donc la
 * relance ne repaie que les threads réellement manquants.
 * Les appels IA des threads restants partent EN PARALLÈLE (un boss = 5 appels Sonnet ; en série la
 * notation frôlait la durée maximale de la fonction) ; les écritures, elles, restent séquentielles.
 */
/** La session et ses threads — extrait pour que `SessionRow` s'INFÈRE de la requête (pas de type manuscrit). */
async function fetchSession(admin: Admin, sessionId: string) {
  const { data, error } = await admin
    .from('training_sessions')
    .select('id, kind, status, case_id, module_id, ended_at, scored_at, training_threads(id, position, status, lost_reason, ref_case_id, boss_fan_id, fan_name)')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function scoreSessionById(sessionId: string, opts: { force?: boolean } = {}): Promise<{ total: number }> {
  const admin = createAdminClient()
  const s = await fetchSession(admin, sessionId)
  if (s.status !== 'active' && !(opts.force && s.status === 'scored')) throw new Error(`session non notable (statut ${s.status})`)
  if (!s.ended_at && !opts.force) throw new Error('session non terminée')
  const kind = s.kind as CaseKind

  // RÉSERVATION (CAS) AVANT le moindre appel payant. `scored_at` posé pendant que le statut reste
  // `active` sert de jeton : le trigger 0113 ne se déclenche que sur `status = 'scored'`, donc
  // marquer ici ne touche ni les bests ni les stats. Sans ce verrou, la session ouverte dans deux
  // onglets (ou « Terminer » ici + rafraîchissement là) lançait DEUX fois la série complète de
  // notations Sonnet — 10 appels payés au lieu de 5 sur un boss, et des lignes training_ai_calls en
  // double. Le rescore admin (`force`) est délibérément exempté : il re-note une session déjà notée.
  if (!opts.force) {
    const { data: claimed, error: cErr } = await admin
      .from('training_sessions')
      .update({ scored_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('status', 'active')
      .is('scored_at', null)
      .select('id')
    if (cErr) throw new Error(cErr.message)
    if (!claimed.length) throw new ScoringBusyError()
  }
  try {
    return await runScoring(admin, sessionId, s, kind, opts)
  } catch (err) {
    // La notation reste RELANÇABLE : on rend le jeton pour que le prochain essai puisse le reprendre.
    // Best-effort — si cette libération échoue, la session reste `active` avec un `scored_at` posé et
    // c'est le rescore admin (force) qui débloque ; on le trace plutôt que de masquer l'erreur d'origine.
    if (!opts.force) {
      const { error: rErr } = await admin
        .from('training_sessions')
        .update({ scored_at: null })
        .eq('id', sessionId)
        .eq('status', 'active')
      if (rErr) console.error('[training score] jeton non rendu', rErr.message)
    }
    throw err
  }
}

/** Notation déjà en vol pour cette session (deux onglets) — pas une panne : ni Sentry, ni réessai. */
export class ScoringBusyError extends Error {
  constructor() {
    super('Notation déjà en cours')
    this.name = 'ScoringBusyError'
  }
}

type Admin = ReturnType<typeof createAdminClient>
type SessionRow = Awaited<ReturnType<typeof fetchSession>>

/**
 * Écriture de la note d'UN thread (axes puis note). Extraite parce qu'elle sert à DEUX endroits : le
 * parcours normal et la persistance des appels réussis quand un AUTRE thread a échoué. Les deux
 * doivent écrire exactement la même chose.
 *
 * Ordre volontaire — axes d'abord : la ligne de `training_thread_scores` est le MARQUEUR que la
 * relance lit pour savoir quoi ne pas repayer. Écrite en dernier, elle ne peut pas exister sans ses
 * axes ; l'inverse laissait, sur un échec entre les deux, une note reprise pour toujours et amputée
 * de son détail.
 */
async function writeThreadScore(admin: Admin, threadId: string, r: ScoreResult): Promise<void> {
  const { error: dErr } = await admin.from('training_thread_axis_scores').delete().eq('thread_id', threadId)
  if (dErr) throw new Error(dErr.message)
  if (r.axes.length) {
    const { error: aErr } = await admin
      .from('training_thread_axis_scores')
      .insert(r.axes.map((a) => ({ thread_id: threadId, axis_key: a.key, axis_name: a.name, score: a.score })))
    if (aErr) throw new Error(aErr.message)
  }
  const { error: uErr } = await admin.from('training_thread_scores').upsert(
    {
      thread_id: threadId, total: r.total, objective_reached: r.objectiveReached, capped: r.capped, comment: r.comment,
      moments: r.moments, scored_at: new Date().toISOString(),
    },
    { onConflict: 'thread_id' },
  )
  if (uErr) throw new Error(uErr.message)
}

/** Corps de la notation, exécuté sous la réservation posée par `scoreSessionById`. */
async function runScoring(
  admin: Admin,
  sessionId: string,
  s: SessionRow,
  kind: CaseKind,
  opts: { force?: boolean },
): Promise<{ total: number }> {

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
  // Le boss ne note PAS sur un cas (barème en 6 étapes, contexte porté par le fan) → aucune requête.
  const caseIds = kind === 'boss'
    ? []
    : kind === 'arena'
      ? [...new Set(s.training_threads.map((t) => t.ref_case_id).filter((x): x is string => !!x))]
      : [s.case_id]
  const { data: cases, error: cErr } = caseIds.length
    ? await admin.from('training_cases').select('id, context, objective, target_line, training_modules(code), training_case_secrets(expected)').in('id', caseIds)
    : { data: [], error: null }
  if (cErr) throw new Error(cErr.message)
  const caseById = new Map((cases ?? []).map((c) => [c.id, c]))
  const bossFanIds = s.training_threads.map((t) => t.boss_fan_id).filter((x): x is string => !!x)
  const { data: fans, error: fErr } = bossFanIds.length
    ? await admin.from('training_case_boss_fans').select('id, name, persona, training_boss_fan_secrets(budget_cap, nego_where, meet_when)').in('id', bossFanIds)
    : { data: [], error: null }
  if (fErr) throw new Error(fErr.message)
  const fanById = new Map((fans ?? []).map((f) => [f.id, f]))

  const ordered = [...s.training_threads].sort((a, b) => a.position - b.position)

  // Threads DÉJÀ notés : repris tels quels (aucun appel, aucune écriture) — une relance après un
  // échec partiel ne repaie pas ce qui était noté. `force` remet tout à plat : c'est le sens du
  // rescore admin.
  const { data: done, error: exErr } = opts.force
    ? { data: [], error: null }
    : await admin.from('training_thread_scores').select('thread_id, total, objective_reached').in('thread_id', ordered.map((t) => t.id))
  if (exErr) throw new Error(exErr.message)
  const keep = new Map((done ?? []).map((r) => [r.thread_id, { total: r.total, objective: r.objective_reached }]))

  // 1) Préparation : note synthétique des threads perdus (0, sans appel) et fabrication des appels
  // IA. Le contexte de notation est résolu ICI, hors du try : un fan ou un cas introuvable est un
  // défaut d'INTÉGRITÉ des données, pas un échec du modèle — le tracer en appel IA raté créerait
  // une ligne fantôme dans training_ai_calls (coût et fiabilité faussés).
  const scores = new Map<string, ScoreResult>()
  const pending: { threadId: string; call: () => Promise<ScoreResult> }[] = []
  for (const t of ordered) {
    if (keep.has(t.id)) continue
    if (t.status === 'lost') {
      const reason = (t.lost_reason ?? 'timeout') as FaultCode | 'timeout'
      const label = FAULT_LABELS[reason] ?? FAULT_LABELS.timeout
      scores.set(t.id, {
        total: 0, objectiveReached: false, capped: false, comment: `${label.title}. ${label.text}`, moments: [], axes: [],
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, latencyMs: 0, model: '',
      })
      continue
    }
    const history: HistoryMessage[] = (msgs ?? [])
      .filter((m) => m.thread_id === t.id)
      .map((m) => ({ speaker: m.speaker as HistoryMessage['speaker'], body: m.body, mediaPrice: m.media_price }))
    const transcript = formatTranscript(history)
    if (kind === 'boss') {
      const f = t.boss_fan_id ? fanById.get(t.boss_fan_id) : undefined
      if (!f) throw new Error('fan du boss introuvable')
      const sec = Array.isArray(f.training_boss_fan_secrets) ? f.training_boss_fan_secrets[0] : f.training_boss_fan_secrets
      const system = bossScoreSystemPrompt({
        name: f.name, persona: f.persona, budgetCap: sec?.budget_cap ?? null, negoWhere: sec?.nego_where ?? null, meetWhen: sec?.meet_when ?? null,
      })
      pending.push({ threadId: t.id, call: () => scoreBossThread({ system, transcript }) })
    } else {
      const c = caseById.get(kind === 'arena' ? (t.ref_case_id ?? '') : s.case_id)
      if (!c) throw new Error('cas de notation introuvable')
      const sec = Array.isArray(c.training_case_secrets) ? c.training_case_secrets[0] : c.training_case_secrets
      // Module du cas NOTÉ — en défi c'est celui du solo REJOUÉ, pas celui de l'arène : les deux
      // clauses de fin de GLA (Négociation, clémence du défi) se décident là-dessus.
      const mod = Array.isArray(c.training_modules) ? c.training_modules[0] : c.training_modules
      const system = scoreSystemPrompt({
        scoringNotes, context: c.context, objective: c.objective, targetLine: c.target_line, expected: sec?.expected ?? null, axes,
        moduleCode: mod?.code ?? '', isArena: kind === 'arena',
      })
      pending.push({ threadId: t.id, call: () => scoreThread({ system, transcript, axes }) })
    }
  }

  // 2) Appels IA EN PARALLÈLE (un boss = 5 appels Sonnet ; en série la notation frôlait la durée
  // maximale de la fonction). `Promise.allSettled`, surtout PAS `Promise.all` : celui-ci rejette au
  // PREMIER échec et rend la main pendant que les autres appels — DÉJÀ PARTIS, donc DÉJÀ FACTURÉS —
  // courent encore. Leur `logAiCall` s'exécutait alors après le retour de la fonction, sur une
  // instance que l'hébergeur peut geler dès la réponse rendue : cette consommation n'était tracée
  // NULLE PART, alors que la facture, elle, arrive. `allSettled` attend les N appels ET leurs N
  // traces ; la sémantique pour l'appelant ne bouge pas, le premier échec est relancé à la fin.
  const settled = await Promise.allSettled(
    pending.map(async ({ threadId, call }) => {
      let r: ScoreResult
      try {
        r = await call()
      } catch (err) {
        // Trace AVANT de relancer (miroir de sendMessage). `AiCallError` = la réponse est ARRIVÉE
        // puis a été refusée, tronquée ou jugée illisible : elle est FACTURÉE, on enregistre sa
        // consommation RÉELLE au lieu de 0 — ce sont précisément les notations qu'une relance
        // repaie. Une panne réseau reste une `Error` nue : rien n'a été facturé, donc 0 token.
        const billed = err instanceof AiCallError
          ? { model: err.model, usage: err.usage, latencyMs: err.latencyMs }
          : { model: SCORE_MODEL, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, latencyMs: 0 }
        await logAiCall(admin, { sessionId, threadId, kind: 'score', ...billed, ok: false })
        throw err
      }
      await logAiCall(admin, { sessionId, threadId, kind: 'score', model: r.model, usage: r.usage, latencyMs: r.latencyMs, ok: true })
      return { threadId, r }
    }),
  )
  for (const x of settled) if (x.status === 'fulfilled') scores.set(x.value.threadId, x.value.r)
  const failure = settled.find((x): x is PromiseRejectedResult => x.status === 'rejected')
  if (failure) {
    // On PERSISTE les notes des appels qui ont réussi avant de relancer l'échec : sans ça, un échec
    // sur le 5e fan d'un boss faisait REPAYER les quatre autres à chaque relance (la reprise ne lit
    // que `training_thread_scores`). Best-effort : l'erreur remontée doit rester CELLE DE L'APPEL —
    // une écriture ratée ici ne coûte que l'économie de la relance, elle ne doit pas masquer la cause.
    for (const [threadId, r] of scores) {
      if (keep.has(threadId)) continue
      try {
        await writeThreadScore(admin, threadId, r)
      } catch (wErr) {
        console.error('[training score] note partielle non persistée', wErr)
      }
    }
    throw failure.reason
  }

  // 3) Écritures, dans l'ordre des conversations.
  const totals: { total: number; objective: boolean }[] = []
  for (const t of ordered) {
    const previous = keep.get(t.id)
    if (previous) {
      totals.push(previous)
      continue
    }
    const r = scores.get(t.id)
    if (!r) throw new Error('notation manquante')
    await writeThreadScore(admin, t.id, r)
    totals.push({ total: r.total, objective: r.objectiveReached })
  }
  const total = totals.length ? Math.round(totals.reduce((n, x) => n + x.total, 0) / totals.length) : 0
  // Objectif de la SESSION. Boss (spec §4) : réussi si la MOYENNE des 5 fans atteint 60 — exiger
  // les 5 (`every`) rendait l'examen final quasi impossible et contredisait la règle du barème.
  // Solo/défi : l'objectif du cas doit être atteint sur CHAQUE conversation.
  const objective = kind === 'boss' ? totals.length > 0 && total >= BOSS_PASS : totals.length > 0 && totals.every((x) => x.objective)
  // `scored_at` N'EST PAS déplacé par une RE-NOTATION admin : la fenêtre du classement hebdomadaire
  // — donc l'argent de la roue — est bornée dessus. Re-noter lundi une session jouée vendredi la
  // sortait d'une semaine DÉJÀ PAYÉE et l'ajoutait à la semaine en cours, où elle pouvait ouvrir un
  // 2e ticket pour le même travail. Effet voulu en prime : `training_refresh_stats` reçoit le jour
  // d'ORIGINE, donc un rescore du lendemain ne gonfle plus la série ni les jours actifs.
  // Le trigger (0116) se déclenche désormais aussi sur un changement de total / objective_reached :
  // les bests et les stats restent recalculés, y compris pour une re-notation à la baisse.
  const { error: sErr } = await admin
    .from('training_sessions')
    .update({
      status: 'scored',
      total,
      objective_reached: objective,
      scored_at: opts.force ? (s.scored_at ?? new Date().toISOString()) : new Date().toISOString(),
      ended_at: s.ended_at ?? new Date().toISOString(),
    })
    .eq('id', sessionId)
  if (sErr) throw new Error(sErr.message)
  return { total }
}
