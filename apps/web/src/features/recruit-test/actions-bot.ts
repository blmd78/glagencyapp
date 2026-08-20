'use server'

// Test de recrutement public — les deux actions qui APPELLENT L'IA : la conversation avec le client
// (Haiku, un appel par message) et la notation de la transcription (Sonnet, un seul appel).
// Séparées d'`actions.ts` pour la même raison qu'elles coûtent de l'argent : ce sont les seules
// dont l'échec doit être tracé (Sentry) et dont les compteurs de tokens sont tenus à jour.
//
// Publiques, donc mêmes règles qu'`actions.ts` : aucune session, tout en service-role, chaque
// handler recharge la tentative et revérifie son état. Deux plafonds bornent la dépense :
// `bot_messages` (config, relue à CHAQUE tour — la fermer en cours de test doit prendre effet) et
// la notation unique par tentative (idempotente).
//
// La transcription est tenue CÔTÉ SERVEUR (écart assumé vs GLA, spec §1) : l'historique envoyé au
// modèle vient de `recruit_messages`, jamais du client — pas de conversation forgée pour se faire
// bien noter.

import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import type { RecruitPersonaName } from '@/lib/ai/recruit-prompts'
import { replyAsRecruitBot, scoreRecruitTranscript } from '@/lib/ai/recruit-score'
import { scoreAttemptInput, sendToBotInput } from './schema'
import { STEPS_MISSING, loadAttempt, loadHistory, readConfig, requireInProgress } from './shared'
import type { BotTurn, ScoreResult } from './types'

const CHAT_OVER = 'La conversation est terminée.'
const BOT_KO = 'Le client n’a pas répondu — réessaie.'
const SCORE_KO = 'L’analyse a échoué — réessaie dans un instant.'
/** Réponse du client bornée : `recruit_messages.body` est du `text` libre, autant ne pas y écrire un pavé. */
const REPLY_MAX = 1000

/**
 * Un tour de conversation. Le candidat envoie un message OU un média verrouillé (mécanique GLA :
 * le média est un message à part entière, corps `[MEDIA VERROUILLE - X€]`, et c'est cette forme que
 * le prompt du bot ET celui de la notation savent lire).
 *
 * En cas de panne IA, le tour est ANNULÉ, pas subi : le message du candidat qu'on vient d'écrire est
 * retiré (sinon il resterait sans réponse et le renvoi empilerait deux messages du candidat) —
 * même patron que l'entraînement (`training-session/actions.ts`).
 */
export async function sendToBot(raw: unknown): Promise<ActionResult<BotTurn>> {
  return runAction({
    schema: sendToBotInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<BotTurn> => {
      const admin = createAdminClient()
      const attempt = await loadAttempt(admin, d.attemptId)
      requireInProgress(attempt)
      const config = await readConfig(admin)
      // Chemin rapide : le compteur suffit dans le cas normal (un tour à la fois).
      if (attempt.bot_replies >= config.botMessages) throw new BusinessError(CHAT_OVER)

      const history = await loadHistory(admin, attempt.id)
      const nextPos = (history[history.length - 1]?.position ?? -1) + 1
      // VRAI plafond, et le seul qui tienne face au pipelining : `bot_replies` est lu puis réécrit
      // en valeur absolue, donc N appels lancés ensemble lisent tous le même compteur périmé et
      // passent tous le test ci-dessus. La POSITION, elle, est allouée atomiquement par
      // `unique (attempt_id, position)` — les messages alternent candidat/client, donc une
      // conversation complète occupe exactement 2 × bot_messages positions (0..2N-1) : au-delà,
      // l'insert suivant est refusé ici, ou perd la course sur l'index (23505). C'est ce qui borne
      // réellement la dépense IA.
      if (nextPos >= 2 * config.botMessages) throw new BusinessError(CHAT_OVER)
      const body = d.mediaPrice != null ? `[MEDIA VERROUILLE - ${d.mediaPrice}€]` : d.body
      // Inatteignable : le OU EXCLUSIF de `sendToBotInput` garantit l'un des deux. Le garde-fou est
      // là pour que le compilateur le sache SANS cast — un `as string` mentirait si le refine sautait.
      if (!body) throw new Error('sendToBot : ni message ni média après validation')

      const { data: mine, error: iErr } = await admin
        .from('recruit_messages')
        .insert({ attempt_id: attempt.id, position: nextPos, speaker: 'candidat', body, media_price: d.mediaPrice ?? null })
        .select('id')
        .single()
      // 23505 sur `unique (attempt_id, position)` = double soumission (double-clic, reprise réseau).
      if (iErr?.code === '23505') throw new BusinessError('Message déjà envoyé.')
      if (iErr) throw new Error(iErr.message)

      let reply
      try {
        reply = await replyAsRecruitBot({
          // `persona` est du `text` en base : le cast est couvert par le repli GLA de
          // `recruitBotSystem` (`PERSONAS[x] ?? Lucas`) — une valeur inconnue donne un prompt
          // valide, jamais un `undefined` interpolé.
          persona: attempt.persona as RecruitPersonaName,
          history: [...history.map((m) => ({ speaker: m.speaker, body: m.body })), { speaker: 'candidat' as const, body }],
        })
      } catch (err) {
        const { data: deleted, error: dErr } = await admin.from('recruit_messages').delete().eq('id', mine.id).select('id')
        if (dErr) console.error('[recrutement bot] message non retiré', dErr.message)
        else if (deleted.length === 0) console.error('[recrutement bot] message non retiré (aucune ligne)', mine.id)
        // Sentry AVANT le BusinessError : `runAction` ne capture QUE les erreurs techniques, et on
        // rend ici un message métier — sans ça, une panne du fournisseur IA n'existerait nulle part.
        Sentry.captureException(err)
        console.error('[recrutement bot]', err)
        throw new BusinessError(BOT_KO)
      }

      const { error: rErr } = await admin
        .from('recruit_messages')
        .insert({ attempt_id: attempt.id, position: nextPos + 1, speaker: 'client', body: reply.text.slice(0, REPLY_MAX) })
      if (rErr) throw new Error(rErr.message)

      const botReplies = attempt.bot_replies + 1
      const { error: uErr } = await admin
        .from('recruit_attempts')
        .update({
          bot_replies: botReplies,
          input_tokens: attempt.input_tokens + reply.usage.inputTokens,
          output_tokens: attempt.output_tokens + reply.usage.outputTokens,
        })
        .eq('id', attempt.id)
      if (uErr) throw new Error(uErr.message)

      return { reply: reply.text, done: botReplies >= config.botMessages }
    },
  })
}

/**
 * Notation de la conversation (un seul appel Sonnet par tentative). Exige que TOUTES les épreuves
 * soient renseignées et qu'il y ait de la matière à noter (au moins un aller-retour), sinon le
 * candidat paierait un appel IA pour une transcription vide.
 *
 * Idempotente : `bot_total` déjà posé → on renvoie le total sans rappeler le modèle. Ce test passe
 * AVANT celui du statut, justement parce qu'une tentative notée n'est plus `en_cours` (un renvoi
 * après un aller-retour réseau doit retomber sur son score, pas sur « test terminé »).
 */
export async function scoreAttempt(raw: unknown): Promise<ActionResult<ScoreResult>> {
  return runAction({
    schema: scoreAttemptInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<ScoreResult> => {
      const admin = createAdminClient()
      const attempt = await loadAttempt(admin, d.attemptId)
      if (attempt.bot_total !== null) return { total: attempt.bot_total }
      requireInProgress(attempt)
      if (attempt.qi_score === null || attempt.typing === null || attempt.connection_mbps === null) {
        throw new BusinessError(STEPS_MISSING)
      }

      const history = await loadHistory(admin, attempt.id)
      if (history.length < 2) throw new BusinessError(STEPS_MISSING)

      let score
      try {
        score = await scoreRecruitTranscript(history.map((m) => ({ speaker: m.speaker, body: m.body })))
      } catch (err) {
        Sentry.captureException(err)
        console.error('[recrutement notation]', err)
        throw new BusinessError(SCORE_KO)
      }

      // `.is('bot_total', null)` : deux notations concurrentes (double-clic sur « Terminer ») ne
      // peuvent pas écraser le score de l'autre.
      const { data: written, error } = await admin
        .from('recruit_attempts')
        .update({
          orthographe: score.orthographe,
          coherence: score.coherence,
          relance: score.relance,
          vente: score.vente,
          bot_total: score.total,
          status: 'notee',
          input_tokens: attempt.input_tokens + score.usage.inputTokens,
          output_tokens: attempt.output_tokens + score.usage.outputTokens,
        })
        .eq('id', attempt.id)
        .is('bot_total', null)
        .select('id')
      if (error) throw new Error(error.message)

      // Course perdue : une autre notation a déjà écrit. Le score qu'on vient de calculer n'existe
      // NULLE PART en base — le rendre ferait diverger l'écran du candidat du dossier de l'agence.
      // On relit et on rend la valeur PERSISTÉE, la seule qui servira au verdict.
      if (written.length === 0) {
        const persisted = await loadAttempt(admin, attempt.id)
        if (persisted.bot_total === null) throw new Error(`Notation perdue sur la tentative ${attempt.id}`)
        return { total: persisted.bot_total }
      }

      return { total: score.total }
    },
  })
}
