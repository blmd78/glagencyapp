'use server'

// Test de recrutement public — les deux actions qui APPELLENT L'IA : la conversation avec le client
// (Haiku, un appel par message) et la notation de la transcription (Sonnet, un seul appel).
// Séparées d'`actions.ts` pour la même raison qu'elles coûtent de l'argent : ce sont les seules
// dont l'échec doit être tracé (Sentry) et dont les compteurs de tokens sont tenus à jour.
//
// Publiques, donc mêmes règles qu'`actions.ts` : aucune session, tout en service-role, chaque
// handler recharge la tentative et revérifie son état. Trois choses bornent la dépense :
// la case `open` — relue à CHAQUE appel, pour que décocher coupe les appels IA des tentatives EN
// COURS, tout de suite —, le plafond de messages, et la notation unique par tentative (idempotente).
//
// ⚠️ Le plafond, lui, est celui FIGÉ SUR LA TENTATIVE (`attempt.bot_messages`, 0115), jamais la
// config du moment : le client verrouille l'envoi sur le nombre qu'on lui a servi au démarrage.
// Le relire en direct désaccordait les trois (client, plafond d'envoi, exigence de notation) et
// pouvait enfermer un candidat — sans issue ni remboursement des appels déjà payés.
//
// La transcription est tenue CÔTÉ SERVEUR (écart assumé vs GLA, spec §1) : l'historique envoyé au
// modèle vient de `recruit_messages`, jamais du client — pas de conversation forgée pour se faire
// bien noter.

import * as Sentry from '@sentry/nextjs'
import { aiMessage } from '@/lib/ai/errors'
import { AiCallError } from '@/lib/ai/score'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import type { RecruitPersonaName } from '@/lib/ai/recruit-prompts'
import { replyAsRecruitBot, scoreRecruitTranscript } from '@/lib/ai/recruit-score'
import { scoreAttemptInput, sendToBotInput } from './schema'
import { CLOSED, STEPS_MISSING, loadAttempt, loadHistory, readConfig, requireInProgress } from './shared'
import { BOT_ALREADY_SENT, CHAT_OVER, mediaLabel, type BotTurn } from './types'

const BOT_KO = 'Le client n’a pas répondu — réessaie.'
const SCORE_KO = 'L’analyse a échoué — réessaie dans un instant.'
/** Refus GÉNÉRIQUE : on ne dit pas au candidat combien de messages il lui manque. */
const CHAT_INCOMPLETE = 'La conversation n’est pas terminée.'
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
      // Deux lectures indépendantes → en parallèle (l'ordre des VÉRIFICATIONS, lui, ne change pas).
      const [attempt, config] = await Promise.all([loadAttempt(admin, d.attemptId), readConfig(admin)])
      requireInProgress(attempt)
      // Test fermé = coupure IMMÉDIATE de la dépense IA, tentatives en cours comprises (c'est ce
      // que promet la case « Test ouvert » de la config). Le vérifier à l'entrée seulement
      // laissait tourner tous les tests déjà commencés — soit, à `bot_messages` près, l'essentiel
      // du coût. Même message qu'à l'entrée : le candidat n'a pas à distinguer les deux moments.
      if (!config.open) throw new BusinessError(CLOSED)
      // Chemin rapide : le compteur suffit dans le cas normal (un tour à la fois).
      if (attempt.bot_replies >= attempt.bot_messages) throw new BusinessError(CHAT_OVER)

      const history = await loadHistory(admin, attempt.id)
      const nextPos = (history[history.length - 1]?.position ?? -1) + 1
      // VRAI plafond, et le seul qui tienne face au pipelining : `bot_replies` est lu puis réécrit
      // en valeur absolue, donc N appels lancés ensemble lisent tous le même compteur périmé et
      // passent tous le test ci-dessus. La POSITION, elle, est allouée atomiquement par
      // `unique (attempt_id, position)` — les messages alternent candidat/client, donc une
      // conversation complète occupe exactement 2 × bot_messages positions (0..2N-1) : au-delà,
      // l'insert suivant est refusé ici, ou perd la course sur l'index (23505). C'est ce qui borne
      // réellement la dépense IA.
      if (nextPos >= 2 * attempt.bot_messages) throw new BusinessError(CHAT_OVER)
      const body = d.mediaPrice != null ? mediaLabel(d.mediaPrice) : d.body
      // Inatteignable : le OU EXCLUSIF de `sendToBotInput` garantit l'un des deux. Le garde-fou est
      // là pour que le compilateur le sache SANS cast — un `as string` mentirait si le refine sautait.
      if (!body) throw new Error('sendToBot : ni message ni média après validation')

      const { data: mine, error: iErr } = await admin
        .from('recruit_messages')
        .insert({ attempt_id: attempt.id, position: nextPos, speaker: 'candidat', body, media_price: d.mediaPrice ?? null })
        .select('id')
        .single()
      // 23505 sur `unique (attempt_id, position)` = double soumission (double-clic, reprise réseau).
      if (iErr?.code === '23505') throw new BusinessError(BOT_ALREADY_SENT)
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
        throw new BusinessError(
          aiMessage(err, {
            retryable: BOT_KO,
            // Un CANDIDAT, pas un membre de l'agence : il n'a personne à prévenir en interne et ne
            // doit rien apprendre de nos coulisses. On lui dit quoi faire, et rien d'autre.
            blocked: 'Le test est momentanément indisponible. Reviens plus tard — ta progression est enregistrée.',
            // Saturation : les deux modèles sont pris (le repli a échoué aussi). Attendre est la
            // seule chose utile — et un candidat qui reclique en rafale sur une page publique est
            // exactement ce qu'il ne faut pas encourager.
            overloaded: 'Le client ne répond pas, tout le monde écrit en même temps. Attends une minute et réessaie — ta progression est enregistrée.',
          }),
        )
      }

      const { error: rErr } = await admin
        .from('recruit_messages')
        .insert({ attempt_id: attempt.id, position: nextPos + 1, speaker: 'client', body: reply.text.slice(0, REPLY_MAX) })
      // 23505 ICI = un envoi CONCURRENT a pris la position pendant notre appel IA (1-3 s) : le tour
      // ne nous appartient plus. Sans ce traitement, la réponse payée était jetée sur une erreur
      // technique, les compteurs de tokens sautés, et le message du candidat RESTAIT — laissant deux
      // messages candidat consécutifs dans la transcription servie à la notation, et permettant de
      // doubler le nombre d'appels payés par tentative. On annule donc NOTRE tour en entier.
      if (rErr?.code === '23505') {
        const { error: dErr } = await admin.from('recruit_messages').delete().eq('id', mine.id)
        if (dErr) console.error('[recrutement bot] message non retiré (course)', dErr.message)
        // Les tokens de l'appel perdu sont quand même comptés : ils ont été facturés.
        const { error: tErr } = await admin
          .from('recruit_attempts')
          .update({
            input_tokens: attempt.input_tokens + reply.usage.inputTokens,
            output_tokens: attempt.output_tokens + reply.usage.outputTokens,
          })
          .eq('id', attempt.id)
        if (tErr) console.error('[recrutement bot] tokens non comptés', tErr.message)
        throw new BusinessError(BOT_ALREADY_SENT)
      }
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

      return { reply: reply.text, done: botReplies >= attempt.bot_messages }
    },
  })
}

/**
 * Notation de la conversation (un seul appel Sonnet par tentative). Exige que TOUTES les épreuves
 * soient renseignées et que la conversation soit COMPLÈTE, sinon le candidat paierait un appel IA
 * pour une transcription tronquée — et serait noté sur une épreuve qu'il n'a pas passée.
 *
 * Idempotente : `bot_total` déjà posé → on rend « c'est fait » sans rappeler le modèle. Ce test
 * passe AVANT celui du statut, justement parce qu'une tentative notée n'est plus `en_cours` (un
 * renvoi après un aller-retour réseau doit retomber sur un succès, pas sur « test terminé »).
 * Aucun chiffre ne redescend (cf. `types.ts`).
 */
export async function scoreAttempt(raw: unknown): Promise<ActionResult<void>> {
  return runAction({
    schema: scoreAttemptInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<void> => {
      const admin = createAdminClient()
      // Deux lectures indépendantes → en parallèle (l'ordre des VÉRIFICATIONS ne change pas).
      const [attempt, config] = await Promise.all([loadAttempt(admin, d.attemptId), readConfig(admin)])
      if (attempt.bot_total !== null) return
      requireInProgress(attempt)
      // Comme `sendToBot` : test fermé = plus un euro d'IA, y compris sur les tentatives en cours.
      if (!config.open) throw new BusinessError(CLOSED)
      if (attempt.qi_score === null || attempt.typing === null || attempt.connection_mbps === null) {
        throw new BusinessError(STEPS_MISSING)
      }

      const history = await loadHistory(admin, attempt.id)
      if (history.length < 2) throw new BusinessError(STEPS_MISSING)
      // Conversation COMPLÈTE exigée, comptée EN BASE (transcription serveur) et pas sur
      // `bot_replies` : ce compteur est lu-puis-réécrit en valeur absolue, donc deux tours
      // concurrents peuvent le laisser sous-évalué alors que les messages, eux, sont bien là.
      // Sans ce garde-fou, un appel direct à `scoreAttempt` après un seul message faisait noter
      // une conversation de 2 lignes sur les mêmes 4 axes qu'une conversation entière — un
      // raccourci gagnant si la notation est plus indulgente sur peu de matière.
      // Exigence de LA TENTATIVE (colonne figée au démarrage, 0115), pas la config du moment : le
      // client verrouille l'envoi sur ce même nombre (`flow.botMessages`), donc relever le réglage
      // en cours de route rendait la conversation impossible à compléter — `CHAT_INCOMPLETE` pour
      // toujours sur une tentative qui avait déjà payé ses appels IA.
      const sent = history.filter((m) => m.speaker === 'candidat').length
      if (sent < attempt.bot_messages) throw new BusinessError(CHAT_INCOMPLETE)

      // RÉSERVATION (CAS) AVANT l'appel payant — cette action est PUBLIQUE (`noGuard`, /postuler
      // exempté du proxy). Le garde `bot_total !== null` plus haut est lu-puis-agi : N appels
      // concurrents le passaient tous et payaient tous leur notation Sonnet, dont une seule était
      // persistée — et le recrutement n'écrit pas dans `training_ai_calls`, donc la dépense
      // n'apparaissait NULLE PART sauf sur la facture. Le plafond 0115 borne les démarrages, pas
      // les notations. Même patron que `lib/services/training-scoring.ts`.
      // Le statut sert de jeton : `submitCandidate` exige déjà `bot_total` non nul (actions.ts),
      // une soumission tombant dans cette fenêtre reçoit donc un refus métier, jamais un dossier
      // incomplet.
      const { data: claimed, error: cErr } = await admin
        .from('recruit_attempts')
        .update({ status: 'notee' })
        .eq('id', attempt.id)
        .eq('status', 'en_cours')
        .is('bot_total', null)
        .select('id')
      if (cErr) throw new Error(cErr.message)
      // Aucune ligne : une autre notation est en vol (ou vient d'aboutir). Rejeu = succès, comme le
      // retour anticipé sur `bot_total !== null` — surtout pas un second appel payant.
      if (!claimed.length) return

      let score
      try {
        score = await scoreRecruitTranscript(history.map((m) => ({ speaker: m.speaker, body: m.body })))
      } catch (err) {
        // Refus ou troncature : la réponse est ARRIVÉE puis a été jetée — elle est facturée. On la
        // compte, en relisant d'abord les compteurs (même décalage de plusieurs secondes que la
        // course perdue : écrire depuis `attempt` écraserait un `sendToBot` terminé entre-temps).
        if (err instanceof AiCallError) {
          const fresh = await loadAttempt(admin, attempt.id).catch(() => null)
          if (fresh) {
            const { error: tErr } = await admin
              .from('recruit_attempts')
              .update({
                input_tokens: fresh.input_tokens + err.usage.inputTokens,
                output_tokens: fresh.output_tokens + err.usage.outputTokens,
              })
              .eq('id', attempt.id)
            if (tErr) console.error('[recrutement notation] tokens non comptés', tErr.message)
          }
        }
        // La notation reste relançable : on rend le jeton (best-effort, et seulement si personne
        // n'a écrit entre-temps) avant de remonter l'échec.
        const { error: rErr } = await admin
          .from('recruit_attempts')
          .update({ status: 'en_cours' })
          .eq('id', attempt.id)
          .is('bot_total', null)
        if (rErr) console.error('[recrutement notation] jeton non rendu', rErr.message)
        Sentry.captureException(err)
        console.error('[recrutement notation]', err)
        throw new BusinessError(
          aiMessage(err, {
            retryable: SCORE_KO,
            // Même public que le fan du test : un CANDIDAT. Sa tentative est enregistrée, son jeton
            // de notation a été rendu juste au-dessus — il pourra reprendre.
            blocked: 'L’analyse est momentanément indisponible. Reviens plus tard — ta tentative est enregistrée.',
            // La notation n'a PAS de repli de modèle (cf. `score.ts` : changer de juge changerait les
            // notes) — sur saturation, attendre est la seule issue, et elle est sans risque ici.
            overloaded: 'L’analyse est saturée en ce moment. Attends une minute et réessaie — ta tentative est enregistrée.',
          }),
        )
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
      // NULLE PART en base — seule la valeur PERSISTÉE servira au verdict. On vérifie donc qu'il y
      // a bien une notation en base avant de dire au candidat que c'est fait.
      if (written.length === 0) {
        const persisted = await loadAttempt(admin, attempt.id)
        if (persisted.bot_total === null) throw new Error(`Notation perdue sur la tentative ${attempt.id}`)
        // Le score est jeté, pas la facture : cet appel Sonnet a bien été payé. On l'ajoute aux
        // compteurs RELUS À L'INSTANT — pas à ceux chargés avant l'appel, vieux de plusieurs
        // secondes : un `sendToBot` terminé entre-temps a pu écrire les siens, on les écraserait.
        const { error: tErr } = await admin
          .from('recruit_attempts')
          .update({
            input_tokens: persisted.input_tokens + score.usage.inputTokens,
            output_tokens: persisted.output_tokens + score.usage.outputTokens,
          })
          .eq('id', attempt.id)
        if (tErr) console.error('[recrutement notation] tokens non comptés', tErr.message)
      }
    },
  })
}
