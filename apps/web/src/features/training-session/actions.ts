'use server'

// Server Action de l'entraînement — envoyer un message dans une session. Garde : droit Entraînement
// (frm-entrainement), propriétaire de la session (vérif explicite), refus en impersonation.
// Le fan (IA) est appelé ici, sans streaming (approche A) ; les secrets sont lus en service-role par
// lib/services/training-engine ; chaque appel IA est tracé.
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (0121 : la RLS de
// sessions/threads/messages est en lecture seule) — TOUJOURS après le contrôle `s.profile_id !==
// profile.id` ci-dessous, qui est désormais la seule garde du cloisonnement en écriture.

import * as Sentry from '@sentry/nextjs'
import { aiMessage, isAiOverloaded } from '@/lib/ai/errors'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, requirePageProfileLive, BusinessError, type ActionResult } from '@/lib/actions'
import { FAN_MODEL } from '@/lib/ai/client'
import { replyAsFan } from '@/lib/ai/fan'
import { logAiCall } from '@/lib/ai/log'
import { buildFanSystem, dueAtFrom, revealDelayMs } from '@/lib/services/training-engine'
import { createClient } from '@/lib/supabase/server'
import type { CaseKind, CaseSnapshot, MessageSpeaker } from '@/lib/types/training'
import { closeSessionIfNoOpenThread, revalidateSession } from './actions-shared'
import { sendInput, threadIdInput } from './schema'
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
      const profile = await requirePageProfileLive('frm-entrainement')
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

      // Chrono (autorité serveur) : trop tard → thread perdu, solo → session ratée. Grâce de 2 s,
      // MÊME tolérance que `timeoutThread` — sans elle, un envoi accepté par le client (qui n'a pas
      // encore vu le temps écoulé) pouvait être rejeté ici pour quelques centièmes de latence.
      if (t.next_due_at && now.getTime() > new Date(t.next_due_at).getTime() + 2000) {
        const { error: lErr } = await admin
          .from('training_threads')
          .update({ status: 'lost', lost_reason: 'timeout', next_due_at: null })
          .eq('id', t.id)
          .eq('status', 'open')
        if (lErr) throw new Error(lErr.message)
        if (kind === 'solo') {
          const { error: fErr } = await admin
            .from('training_sessions')
            .update({ status: 'failed', ended_at: now.toISOString() })
            .eq('id', s.id)
          if (fErr) throw new Error(fErr.message)
        } else {
          // Défi/boss : ce thread perdu pouvait être le dernier ouvert → la session se termine.
          await closeSessionIfNoOpenThread(supabase, s.id, now.toISOString())
        }
        revalidateSession(s.id)
        throw new BusinessError('Trop lent — ce fan est parti')
      }

      // Service-role : la table n'est plus lisible par `authenticated` (0117 — le corps du fan
      // était récupérable via PostgREST avant sa révélation). La propriété de la session vient
      // d'être vérifiée ci-dessus avec le client de l'appelant : on ne lit que son thread.
      const { data: history, error: hErr } = await admin
        .from('training_messages')
        .select('id, position, speaker, body, media_price')
        .eq('thread_id', t.id)
        .order('position')
      if (hErr) throw new Error(hErr.message)
      const nextPos = (history?.[history.length - 1]?.position ?? -1) + 1
      // GARDE SERVEUR du média payant — l'UI n'est qu'optimiste (convention du projet). GLA ne
      // l'autorise que sur un cas de VENTE : ailleurs, le prompt du fan n'a PAS la section MÉDIAS
      // PAYANTS (`buildFanSystem` n'injecte `MEDIA_SECTION` que si `is_sale`), donc le fan répond à
      // côté et la transcription fausse la notation. Boss : toujours permis (son prompt porte ses
      // paliers de prix). Défi : c'est le `is_sale` du solo REJOUÉ qui compte, comme pour le prompt.
      if (d.mediaPrice != null && kind !== 'boss') {
        let mediaAllowed = snap.isSale
        if (kind === 'arena' && t.ref_case_id) {
          const { data: refCase, error: rcErr } = await supabase
            .from('training_cases')
            .select('is_sale')
            .eq('id', t.ref_case_id)
            .maybeSingle()
          if (rcErr) throw new Error(rcErr.message)
          mediaAllowed = refCase?.is_sale ?? snap.isSale
        }
        if (!mediaAllowed) throw new BusinessError('Le média payant n’a pas cours sur ce cas')
      }

      // Un média verrouillé est un message À PART ENTIÈRE : le texte éventuel est ignoré
      // (l'UI n'envoie que le média), le corps stocké décrit le média (check SQL : body non vide).
      const body = d.mediaPrice != null ? `Média verrouillé — ${d.mediaPrice} €` : d.body
      const { data: mine, error: iErr } = await admin
        .from('training_messages')
        .insert({ session_id: s.id, thread_id: t.id, position: nextPos, speaker: 'chatter', body, media_price: d.mediaPrice, visible_at: now.toISOString() })
        .select('id, position, visible_at')
        .single()
      // 23505 sur `unique (thread_id, position)` = double soumission (double-clic, reprise réseau) :
      // message métier, pas une erreur technique.
      if (iErr?.code === '23505') throw new BusinessError('Message déjà envoyé')
      if (iErr) throw new Error(iErr.message)
      const chatter: SessionMessage = { id: mine.id, threadId: t.id, position: mine.position, speaker: 'chatter', body, mediaPrice: d.mediaPrice, visibleAt: mine.visible_at }

      // Le fan (IA). Échec réseau/API → message métier ET tour annulé (cf. le catch ci-dessous).
      const system = await buildFanSystem(admin, { kind, caseId: s.case_id, refCaseId: t.ref_case_id, bossFanId: t.boss_fan_id, fanName: t.fan_name, isSale: snap.isSale })
      const hist = [
        ...(history ?? []).map((m) => ({ speaker: m.speaker as MessageSpeaker, body: m.body, mediaPrice: m.media_price })),
        { speaker: 'chatter' as const, body, mediaPrice: d.mediaPrice },
      ]
      let reply
      try {
        reply = await replyAsFan({ system, history: hist, maxTokens: kind === 'boss' ? 260 : 200 })
      } catch (err) {
        // Panne IA : le tour est ANNULÉ, pas subi. On retire le message qu'on vient d'écrire (sinon
        // il resterait sans réponse et le renvoi empilerait deux messages du chatter) et on rouvre
        // une fenêtre de chrono COMPLÈTE — sans ça, une panne survenue près de l'échéance faisait
        // perdre le thread au réessai (le chatter payait notre indisponibilité).
        // `.select('id')` : une suppression qui ne retire RIEN (ligne déjà partie) doit se voir
        // dans les logs — sans ça le message resterait orphelin, en silence.
        const { data: deleted, error: delErr } = await admin.from('training_messages').delete().eq('id', mine.id).select('id')
        if (delErr) console.error('[training fan] message non retiré', delErr.message)
        else if (!deleted.length) console.error('[training fan] message non retiré (aucune ligne)', mine.id)
        if (t.next_due_at) {
          const { error: dueErr } = await admin
            .from('training_threads')
            .update({ next_due_at: dueAtFrom(new Date(), kind, snap.reactionMaxS).toISOString() })
            .eq('id', t.id)
            .eq('status', 'open')
          if (dueErr) console.error('[training fan] chrono non réarmé', dueErr.message)
        }
        await logAiCall(admin, { sessionId: s.id, threadId: t.id, kind: 'fan', model: FAN_MODEL, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, latencyMs: 0, ok: false })
        // Sentry AVANT le BusinessError : `runAction` ne capture QUE les erreurs techniques, et on
        // rend ici un message métier — sans ça, une panne du fournisseur IA n'existait que dans les
        // logs de la fonction (et dans training_ai_calls), jamais dans les alertes.
        // Une SATURATION (529) part en `warning` sous une empreinte fixe : le 2026-09-02, 79 échecs
        // en 17 minutes ont ouvert un incident « High / Escalating » pour une capacité fournisseur
        // sur laquelle on ne peut rien — et qui est désormais contournée par le repli de modèle. Le
        // signal reste (savoir QUAND une vague passe est utile) sans réveiller personne, et l'empreinte
        // fixe les garde groupés : le message porte l'identifiant de requête, donc chaque 529 formait
        // son propre groupe côté logs. Tout le reste garde le niveau `error` par défaut.
        const overloaded = isAiOverloaded(err)
        Sentry.captureException(err, overloaded ? { level: 'warning', fingerprint: ['ai-overloaded', 'training-fan'] } : undefined)
        console.error('[training fan]', err)
        // Revalidation AVANT de rendre l'erreur : le prochain rafraîchissement doit voir le message
        // retiré et le chrono réarmé, sinon le client rejoue un état périmé.
        revalidateSession(s.id)
        throw new BusinessError(
          aiMessage(err, {
            retryable: 'Le fan n’a pas répondu — réessaie',
            // Panne non rejouable : ne pas envoyer le chatter s'acharner. Son tour est annulé, son
            // message retiré et son chrono réarmé — il ne perd rien en s'arrêtant là.
            blocked: 'L’entraînement est indisponible — préviens un encadrant, ton tour n’est pas perdu',
            // Saturation ET repli saturé : les deux modèles sont pris. Recliquer dans la seconde ne
            // sert qu'à ajouter des requêtes à une API qui n'en peut plus — c'est exactement ce qui
            // s'est passé le 2026-09-02. On donne un ordre de grandeur d'attente, et on répète que
            // le tour n'est pas perdu (le chrono est réarmé quelques lignes plus haut).
            overloaded: 'L’IA est saturée en ce moment — attends une minute avant de réessayer, ton tour n’est pas perdu',
          }),
        )
      }
      await logAiCall(admin, { sessionId: s.id, threadId: t.id, kind: 'fan', model: reply.model, usage: reply.usage, latencyMs: reply.latencyMs, ok: reply.ok })

      // `body` du fan borné à 1000 (check SQL) ; jamais vide (fan.ts retombe sur '😒').
      const fanBody = reply.text.slice(0, 1000)
      // Instant RÉEL de la réponse, pris APRÈS l'appel IA — et non le `now` du début de l'action.
      // `now` est figé avant la lecture d'historique, l'insert du message et l'aller-retour au
      // modèle (~1,4 s en moyenne, 2,0 s au p95) : ancrer la révélation dessus faisait partir le
      // chrono suivant AVANT que le chatteur ait vu la réponse. Il payait notre latence sur sa
      // propre minute, à chaque tour — une dizaine de secondes sur un cas de huit tours.
      // `now` reste la référence du contrôle d'échéance plus haut : c'est l'heure d'ARRIVÉE de sa
      // requête qui doit être jugée, pas celle de notre réponse.
      const repliedAt = new Date()
      const visibleAt = new Date(repliedAt.getTime() + revealDelayMs(kind))
      const { data: fanRow, error: fErr } = await admin
        .from('training_messages')
        .insert({ session_id: s.id, thread_id: t.id, position: nextPos + 1, speaker: 'fan', body: fanBody, visible_at: visibleAt.toISOString() })
        .select('id, position, visible_at')
        .single()
      // 23505 ICI = un SECOND envoi du même chatteur (double-clic, deuxième onglet, renvoi après un
      // échec réseau) est parti pendant notre appel IA (1-3 s) et a pris la position que le fan
      // visait. Vu en production le 2026-09-02 à 12h06 : erreur TECHNIQUE, donc message générique à
      // l'écran, message du chatteur laissé en base SANS réponse et tour jamais compté — la
      // transcription devenait bancale et le chatteur croyait ne pas pouvoir envoyer.
      // Le 23505 de l'insert du CHATTEUR (plus haut) ne couvre pas ce cas : là, le second envoi a lu
      // l'historique APRÈS notre premier insert, donc sa position ne collisionnait pas.
      // Même rollback que la panne IA : on retire le message de CE tour-ci (le second envoi, lui, a
      // sa réponse) et on rend la main sur un message métier. L'appel IA déjà payé reste tracé.
      if (fErr?.code === '23505') {
        const { error: dErr } = await admin.from('training_messages').delete().eq('id', mine.id)
        if (dErr) console.error('[training fan] message non retiré après collision', dErr.message)
        revalidateSession(s.id)
        throw new BusinessError('Un autre envoi est passé avant celui-ci — la conversation vient d’être rechargée')
      }
      if (fErr) throw new Error(fErr.message)
      // Corps RETENU tant que la révélation n'a pas eu lieu (solo : délai 0 → livré tout de suite ;
      // défi/boss : 30-120 s). Même règle que `get-session` : sans ça la réponse du fan repartait
      // dans le retour de l'action, lisible dans l'onglet réseau avant l'armement du chrono.
      // Le client la réclame à l'échéance via `revealThread`.
      const fanVisible = visibleAt.getTime() <= repliedAt.getTime()
      const fan: SessionMessage = { id: fanRow.id, threadId: t.id, position: fanRow.position, speaker: 'fan', body: fanVisible ? fanBody : '', mediaPrice: null, visibleAt: fanRow.visible_at }

      const turnsUsed = t.turns_used + 1
      const lost = reply.faultCode !== null
      const done = !lost && turnsUsed >= t.max_turns
      const status = lost ? 'lost' : done ? 'done' : 'open'
      const nextDueAt = status === 'open' ? dueAtFrom(visibleAt, kind, snap.reactionMaxS).toISOString() : null
      // `.eq('status', 'open')` : entre la lecture du thread et ici, `timeoutThread` (autre onglet,
      // chrono du client) a pu le marquer `lost` — un envoi en vol ne doit pas le RESSUSCITER.
      const { data: updated, error: uErr } = await admin
        .from('training_threads')
        .update({ turns_used: turnsUsed, status, lost_reason: lost ? reply.faultCode : null, next_due_at: nextDueAt })
        .eq('id', t.id)
        .eq('status', 'open')
        .select('id')
      if (uErr) throw new Error(uErr.message)
      if (!updated.length) {
        // Course perdue : le thread est déjà clos. On retire LES DEUX messages qu'on venait d'écrire
        // (ils n'appartiennent à aucun tour valide) et on rend l'état réel au chatter. Retirer la
        // seule réponse du fan laissait le message du chatter en fin de transcription d'un thread
        // fermé : la notation lisait alors une relance à laquelle le fan n'a jamais répondu (et
        // pouvait la juger éliminatoire). Même discipline de rollback que le catch d'échec IA.
        const { error: dErr } = await admin.from('training_messages').delete().in('id', [fanRow.id, mine.id])
        if (dErr) console.error('[training fan] messages non retirés', dErr.message)
        revalidateSession(s.id)
        throw new BusinessError('Cette conversation est terminée')
      }

      // Fin de session ? solo perdu → failed ; tous les threads finis → ended_at (la notation suit).
      let sessionStatus: SendResult['sessionStatus'] = 'active'
      let sessionEnded = false
      if (kind === 'solo' && lost) {
        const { error: sErr } = await admin.from('training_sessions').update({ status: 'failed', ended_at: now.toISOString() }).eq('id', s.id)
        if (sErr) throw new Error(sErr.message)
        sessionStatus = 'failed'
        sessionEnded = true
      } else {
        sessionEnded = await closeSessionIfNoOpenThread(supabase, s.id, now.toISOString())
      }
      revalidateSession(s.id)
      return { chatter, fan, thread: { status, lostReason: lost ? reply.faultCode : null, turnsUsed, nextDueAt }, sessionStatus, sessionEnded, serverNow: new Date().toISOString() }
    },
  })
}

/**
 * Corps des messages d'un thread DÉJÀ RÉVÉLÉS (`visible_at` passé) — pendant de la rétention posée
 * par `sendMessage` et `get-session` : le texte du fan ne quitte le serveur qu'à l'échéance, jamais
 * avant. Appelée par le client au moment exact où la bulle doit apparaître.
 *
 * Ne rend QUE des corps déjà dus : un appel anticipé (ou forgé) ne renvoie rien plutôt qu'une
 * erreur — le pire cas est une bulle vide qu'un rafraîchissement remplit. Même garde que les autres
 * actions de la feature : droit Entraînement, pas d'impersonation, propriétaire du thread.
 */
export async function revealThread(raw: unknown): Promise<ActionResult<{ messages: { id: string; body: string }[] }>> {
  return runAction({
    schema: threadIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ threadId }) => {
      const profile = await requirePageProfileLive('frm-entrainement')
      // Service-role (la table n'est plus lisible par `authenticated`, 0117) + contrôle EXPLICITE du
      // propriétaire par la jointure sur la session : c'est lui, et lui seul, qui autorise la lecture.
      const { data: rows, error } = await createAdminClient()
        .from('training_messages')
        .select('id, body, visible_at, training_sessions!inner(profile_id)')
        .eq('thread_id', threadId)
        .lte('visible_at', new Date().toISOString())
        .order('position')
      if (error) throw new Error(error.message)
      const mine = (rows ?? []).filter((m) => m.training_sessions?.profile_id === profile.id)
      return { messages: mine.map((m) => ({ id: m.id, body: m.body })) }
    },
  })
}
