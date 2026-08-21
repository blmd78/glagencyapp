import 'server-only'
import { createAdminClient } from '@glagency/db'
import type { ScoreMoment } from '@/lib/ai/schema'
import { createClient } from '@/lib/supabase/server'
import type { CaseKind, CaseSnapshot, MessageSpeaker, SessionStatus, ThreadStatus } from '@/lib/types/training'
import type { SessionData, SessionThread } from '../types'

/**
 * Une session (RLS : propriétaire, encadrant, admin) : threads + messages + scores + signalement en
 * 3 requêtes. `expected` (secret) n'est lu — en service-role — QUE si la session est notée (révélé
 * après coup, comme GLA) et pour un solo. `previousBest` = meilleur total des AUTRES sessions
 * notées du chatter sur ce cas (record à battre) — jamais la session affichée.
 */
export async function getSession(id: string): Promise<SessionData | null> {
  const supabase = await createClient()
  const { data: s, error } = await supabase
    .from('training_sessions')
    // Un seul littéral (pas de `+`) : supabase-js a besoin du type littéral exact pour typer les embeds.
    .select(
      '*, training_threads(*, training_cases(is_sale), training_case_boss_fans(name, age, job, city, color, persona), training_thread_scores(*), training_thread_axis_scores(axis_key, axis_name, score)), training_reports(id, resolved_at)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!s) return null
  // La LIGNE CIBLE est la réponse attendue RÉSERVÉE AU CORRECTEUR : elle n'entre que dans le prompt
  // de notation (lu directement sur `training_cases`, cf. training-scoring). GLA la gardait côté
  // serveur et ne l'a jamais montrée au joueur — l'afficher revient à donner la correction avant
  // l'exercice. `start-session` ne l'écrit plus dans les nouveaux snapshots ; on purge ici ceux
  // DÉJÀ écrits (sessions en cours et historique). Déclaré AVANT le `.map()` des threads, qui le
  // consomme pour la garde média.
  const snapshot = { ...(s.case_snapshot as unknown as CaseSnapshot) }
  delete (snapshot as { targetLine?: unknown }).targetLine

  // Une seule horloge pour tout le rendu (cf. `body` plus bas) : deux appels à `Date.now()`
  // pourraient encadrer une échéance et livrer un message à moitié révélé.
  const revealNow = Date.now()
  const { data: msgs, error: mErr } = await supabase
    .from('training_messages')
    .select('id, thread_id, position, speaker, body, media_price, visible_at')
    .eq('session_id', id)
    .order('position')
  if (mErr) throw new Error(mErr.message)
  // Record PRÉCÉDENT : meilleur total des AUTRES sessions notées du même couple (profil, cas).
  // `training_case_bests` ne convient pas — son trigger l'a déjà mis à jour avec la session qu'on
  // affiche, donc « record battu ? » aurait toujours été faux (le record valait la note du jour).
  const { data: best, error: bErr } = await supabase
    .from('training_sessions')
    .select('total')
    .eq('profile_id', s.profile_id)
    .eq('case_id', s.case_id)
    .eq('status', 'scored')
    .neq('id', s.id)
    .not('total', 'is', null)
    .order('total', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (bErr) throw new Error(bErr.message)

  let expected: string | null = null
  if (s.status === 'scored' && s.kind === 'solo') {
    const { data: sec, error: eErr } = await createAdminClient()
      .from('training_case_secrets')
      .select('expected')
      .eq('case_id', s.case_id)
      .maybeSingle()
    if (eErr) throw new Error(eErr.message)
    expected = sec?.expected ?? null
  }

  const threads: SessionThread[] = [...s.training_threads]
    .sort((a, b) => a.position - b.position)
    .map((t) => {
      const score = Array.isArray(t.training_thread_scores) ? t.training_thread_scores[0] : t.training_thread_scores
      const fan = Array.isArray(t.training_case_boss_fans) ? t.training_case_boss_fans[0] : t.training_case_boss_fans
      // Cas REJOUÉ d'un thread de défi (`ref_case_id`, seule FK de training_threads vers training_cases).
      const refCase = Array.isArray(t.training_cases) ? t.training_cases[0] : t.training_cases
      return {
        id: t.id,
        position: t.position,
        fanName: t.fan_name,
        status: t.status as ThreadStatus,
        lostReason: t.lost_reason,
        turnsUsed: t.turns_used,
        maxTurns: t.max_turns,
        nextDueAt: t.next_due_at,
        bossFan: fan ? { name: fan.name, age: fan.age, job: fan.job, city: fan.city, color: fan.color, persona: fan.persona } : null,
        // Média payant autorisé sur CETTE conv ? Miroir exact de ce que `buildFanSystem` utilise
        // pour injecter (ou non) les règles de média payant : boss = toujours (son prompt porte ses
        // paliers), défi = le `is_sale` du solo REJOUÉ, solo = celui du cas. Envoyer un média hors
        // de ce cadre atteint un fan dont le prompt n'a pas la section MÉDIAS PAYANTS.
        isSale: (s.kind as CaseKind) === 'boss' ? true : (refCase?.is_sale ?? snapshot.isSale),
        messages: (msgs ?? [])
          .filter((m) => m.thread_id === t.id)
          .map((m) => ({
            id: m.id,
            threadId: m.thread_id,
            position: m.position,
            speaker: m.speaker as MessageSpeaker,
            // RÉVÉLATION DIFFÉRÉE TENUE PAR LE SERVEUR : un message pas encore visible part SANS son
            // corps. Le masquage vivait seulement dans `thread-panel`/`thread-tabs` (filtre CSS du
            // rendu) — le texte du fan voyageait donc dans le payload RSC jusqu'à 2 minutes avant sa
            // révélation, lisible dans l'onglet réseau : de quoi préparer sa réponse avant que le
            // chrono de réaction s'arme, sur la mécanique même qui alimente le classement (et la
            // roue). Le corps est récupéré à l'échéance par `revealThread` (actions.ts).
            body: Date.parse(m.visible_at) > revealNow ? '' : m.body,
            mediaPrice: m.media_price,
            visibleAt: m.visible_at,
          })),
        score: score
          ? {
              total: score.total,
              objectiveReached: score.objective_reached,
              capped: score.capped,
              comment: score.comment,
              moments: (score.moments as ScoreMoment[] | null) ?? [],
              axes: t.training_thread_axis_scores.map((a) => ({ key: a.axis_key, name: a.axis_name, score: a.score })),
            }
          : null,
      }
    })
  // `training_reports` s'embarque en TABLEAU (FK inverse) ; un seul signalement par session côté action.
  const report = s.training_reports[0]
  return {
    id: s.id,
    profileId: s.profile_id,
    kind: s.kind as CaseKind,
    status: s.status as SessionStatus,
    caseId: s.case_id,
    moduleId: s.module_id,
    snapshot,
    total: s.total,
    objectiveReached: s.objective_reached,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    threads,
    expected,
    previousBest: best?.total ?? null,
    report: report ? { id: report.id, resolvedAt: report.resolved_at } : null,
    serverNow: new Date().toISOString(),
  }
}
