'use server'

// Test de recrutement public (`/postuler`) — parcours du candidat : entrée, QI, frappe, connexion,
// soumission. La conversation avec le client IA et la notation vivent dans `actions-bot.ts`.
//
// CES ACTIONS SONT PUBLIQUES : aucune session, donc aucune garde d'auth (`noGuard`) et AUCUNE RLS
// pour rattraper une erreur — la migration 0125 n'accorde que de la lecture à `is_admin()`, tout
// passe ici par `createAdminClient()` (service-role). La conséquence pratique : chaque handler
// recharge la tentative et revérifie SON état avant d'écrire (une action ne fait jamais confiance à
// l'étape précédente), et chaque refus est une `BusinessError` française adressée au candidat.
//
// Les trois `save*` sont IDEMPOTENTES (même patron que `scoreAttempt`) : la réponse HTTP peut se
// perdre APRÈS le commit (réseau mobile, rechargement pendant la requête) et le client rejoue.
// Un rejeu retombe alors sur la valeur déjà enregistrée — la première écriture fait foi — au lieu
// d'un refus définitif qui enfermerait le candidat sur un « Réessayer » sans issue.
//
// Ce qui reste SERVEUR et ne descend jamais : la clé de correction QI (`recruit_attempts.qi_answers`,
// posée au tirage), les seuils du verdict, les notes du bot.

import { randomInt } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { computeVerdict, gradeQi, pickQiQuestions } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import { RECRUIT_PERSONA_NAMES } from '@/lib/ai/recruit-prompts'
import { saveConnectionInput, saveQiInput, saveTypingInput, startAttemptInput, submitCandidateInput } from './schema'
import {
  ATTEMPT_OVER,
  BLOCKED,
  CLOSED,
  STEPS_MISSING,
  clientIp,
  enforceIpRateLimit,
  isBlocked,
  isIdentityBlocked,
  loadAttempt,
  readConfig,
  requireInProgress,
  toAnswerKey,
  toQiBank,
  toTyping,
} from './shared'
import type { QiResult, StartedAttempt, SubmitResult } from './types'

const ALREADY_SENT = 'Ce test a déjà été envoyé.'

/**
 * Entrée du test. Trois gardes, dans cet ordre : test ouvert (config), « un seul essai »
 * (blocklist device/IP), plafond de coût (5 tentatives/IP/24 h). Puis la tentative technique est
 * créée AVANT toute identité (spec §1 : l'identité vient à la fin) — c'est elle qui porte le
 * rate-limit et le coût IA, même sur un abandon.
 *
 * Le persona est tiré au hasard côté serveur (`crypto.randomInt`) plutôt que par le compteur
 * tournant de GLA : en serverless il n'y a pas d'état de process à faire tourner, et l'effet
 * recherché — de la variété entre candidats — est le même.
 */
export async function startAttempt(raw: unknown): Promise<ActionResult<StartedAttempt>> {
  return runAction({
    schema: startAttemptInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<StartedAttempt> => {
      const admin = createAdminClient()
      const config = await readConfig(admin)
      if (!config.open) throw new BusinessError(CLOSED)

      const ip = await clientIp()
      if (await isBlocked(admin, { device: d.device, ip })) throw new BusinessError(BLOCKED)
      await enforceIpRateLimit(admin, ip)

      const persona = RECRUIT_PERSONA_NAMES[randomInt(0, RECRUIT_PERSONA_NAMES.length)]
      // La clé de correction part en base et n'en ressort jamais : `questions` est déjà expurgée
      // de la bonne réponse par `pickQiQuestions`.
      const { questions, answerKey } = pickQiQuestions(toQiBank(config.qiBankRaw), (n) => randomInt(0, n))

      const { data, error } = await admin
        .from('recruit_attempts')
        .insert({ device: d.device, ip, persona, qi_answers: answerKey })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      return {
        attemptId: data.id,
        persona,
        qi: questions,
        typingText: config.typingText,
        qiTimer: config.qiTimer,
        botMessages: config.botMessages,
      }
    },
  })
}

/**
 * QI — la correction est SERVEUR (anti-triche, spec §2) : le client n'envoie que les index choisis,
 * comparés à la clé tirée pour CETTE tentative. `null` (temps écoulé) compte faux, comme GLA.
 * Une seule correction par tentative : le `.is('qi_score', null)` de l'update rend l'écriture
 * atomique — deux appels concurrents ne peuvent pas se départager sur le meilleur score.
 */
export async function saveQi(raw: unknown): Promise<ActionResult<QiResult>> {
  return runAction({
    schema: saveQiInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<QiResult> => {
      const admin = createAdminClient()
      const attempt = await loadAttempt(admin, d.attemptId)
      requireInProgress(attempt)
      const qiScore = gradeQi(toAnswerKey(attempt.qi_answers), d.answers)
      const { data, error } = await admin
        .from('recruit_attempts')
        .update({ qi_score: qiScore })
        .eq('id', attempt.id)
        .eq('status', 'en_cours')
        .is('qi_score', null)
        .select('id')
      if (error) throw new Error(error.message)
      if (data.length === 0) {
        const persisted = await loadAttempt(admin, attempt.id)
        // Score déjà en base = REJEU (réponse HTTP perdue après le commit, réseau mobile,
        // rechargement pendant la requête). C'est un succès, pas un cul-de-sac : refuser
        // enfermerait le candidat sur un « Réessayer » qui ne peut jamais aboutir. On rend la
        // valeur PERSISTÉE, celle qui servira au verdict — la nouvelle est ignorée (anti-rejeu :
        // la première correction fait foi, on ne rejoue pas le questionnaire pour un meilleur score).
        if (persisted.qi_score !== null) return { qiScore: persisted.qi_score }
        requireInProgress(persisted)
        throw new Error(`Correction QI perdue sur la tentative ${attempt.id}`)
      }
      return { qiScore }
    },
  })
}

/**
 * Frappe — déclaratif client, gate caché (fidèle à GLA, écart assumé du plan). On ne peut pas
 * vérifier la mesure ; on borne ce qui est plausible (`saveTypingInput`) et on écrit UNE fois.
 * Idempotente comme `saveQi` : un rejeu retombe sur la mesure déjà enregistrée.
 */
export async function saveTyping(raw: unknown): Promise<ActionResult<void>> {
  return runAction({
    schema: saveTypingInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<void> => {
      const admin = createAdminClient()
      const attempt = await loadAttempt(admin, d.attemptId)
      requireInProgress(attempt)
      const { data, error } = await admin
        .from('recruit_attempts')
        .update({ typing: { wpm: d.wpm, accuracy: d.accuracy, seconds: d.seconds } })
        .eq('id', attempt.id)
        .eq('status', 'en_cours')
        .is('typing', null)
        .select('id')
      if (error) throw new Error(error.message)
      if (data.length === 0) {
        const persisted = await loadAttempt(admin, attempt.id)
        if (persisted.typing !== null) return
        requireInProgress(persisted)
        throw new Error(`Mesure de frappe perdue sur la tentative ${attempt.id}`)
      }
    },
  })
}

/** Connexion — même principe que la frappe (mesure client, gate caché, rejeu idempotent). `numeric(7,1)` en base. */
export async function saveConnection(raw: unknown): Promise<ActionResult<void>> {
  return runAction({
    schema: saveConnectionInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<void> => {
      const admin = createAdminClient()
      const attempt = await loadAttempt(admin, d.attemptId)
      requireInProgress(attempt)
      const { data, error } = await admin
        .from('recruit_attempts')
        .update({ connection_mbps: Math.round(d.mbps * 10) / 10 })
        .eq('id', attempt.id)
        .eq('status', 'en_cours')
        .is('connection_mbps', null)
        .select('id')
      if (error) throw new Error(error.message)
      if (data.length === 0) {
        const persisted = await loadAttempt(admin, attempt.id)
        if (persisted.connection_mbps !== null) return
        requireInProgress(persisted)
        throw new Error(`Mesure de connexion perdue sur la tentative ${attempt.id}`)
      }
    },
  })
}

/**
 * Soumission finale : l'identité arrive ICI (écart voulu vs GLA qui la demandait d'abord) et c'est
 * elle seule qui crée un dossier. Le verdict est calculé SERVEUR (`computeVerdict`) à partir du
 * snapshot de la tentative notée, puis figé dans `recruit_candidates` — l'agence lit un dossier
 * cohérent même si la config change ensuite.
 *
 * Le dossier est écrit AVANT la blocklist, jamais l'inverse : une blocklist posée d'abord puis un
 * dossier en échec enfermerait le candidat dehors sans trace de son test.
 */
export async function submitCandidate(raw: unknown): Promise<ActionResult<SubmitResult>> {
  return runAction({
    schema: submitCandidateInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<SubmitResult> => {
      const admin = createAdminClient()
      const attempt = await loadAttempt(admin, d.attemptId)
      if (attempt.status === 'soumise') throw new BusinessError(ALREADY_SENT)
      if (attempt.status !== 'notee') {
        throw new BusinessError(attempt.status === 'en_cours' ? STEPS_MISSING : ATTEMPT_OVER)
      }

      // « Un seul essai », volet SOUMISSION : e-mail et Discord (device/IP l'ont été à l'entrée).
      if (await isIdentityBlocked(admin, { email: d.email, discord: d.discord })) throw new BusinessError(BLOCKED)

      // 2e passage : l'e-mail porte déjà un dossier. On n'interdit pas — on marque, l'agence tranche.
      const { data: previous, error: pErr } = await admin.from('recruit_candidates').select('id').eq('email', d.email).limit(1)
      if (pErr) throw new Error(pErr.message)

      const config = await readConfig(admin)
      const typing = toTyping(attempt.typing)
      const { qi_score: qi, connection_mbps: mbps, orthographe, coherence, relance, vente, bot_total: botTotal } = attempt
      if (qi === null || mbps === null || orthographe === null || coherence === null || relance === null || vente === null || botTotal === null) {
        throw new BusinessError(STEPS_MISSING)
      }
      const verdict = computeVerdict({
        qi,
        wpm: typing.wpm,
        mbps,
        bot: { total: botTotal, orthographe, coherence, relance, vente },
        config,
      })

      const { error: cErr } = await admin.from('recruit_candidates').insert({
        attempt_id: attempt.id,
        first_name: d.firstName,
        last_name: d.lastName,
        email: d.email,
        discord: d.discord,
        qi_score: qi,
        typing_wpm: typing.wpm,
        connection_mbps: mbps,
        orthographe,
        coherence,
        relance,
        vente,
        bot_total: botTotal,
        global: verdict.global,
        passed: verdict.passed,
        refusal_step: verdict.refusalStep,
        refusal_reason: verdict.refusalReason,
        repeat: previous.length > 0,
      })
      // 23505 sur `unique (attempt_id)` : double soumission (double-clic, reprise réseau).
      if (cErr?.code === '23505') throw new BusinessError(ALREADY_SENT)
      if (cErr) throw new Error(cErr.message)

      // Blocklist « un seul essai » : device + e-mail (+ Discord), et SURTOUT PAS l'IP. Une IP
      // n'identifie pas une personne — derrière un CGNAT ou un partage de connexion mobile, le
      // premier candidat à soumettre condamnerait tous les suivants. Le blocage par IP reste une
      // décision d'ADMIN (page Recrutement), jamais un effet de bord du test. L'IP de la tentative
      // reste enregistrée sur `recruit_attempts` (télémétrie + rate-limit), elle n'est juste pas
      // recopiée ici.
      // `created_by` null = posée par le test lui-même (pas par un admin). Un échec ici n'annule PAS
      // le dossier déjà écrit (le candidat serait renvoyé sur un « déjà envoyé » insoluble) — on
      // trace pour que l'admin puisse bloquer à la main depuis Recrutement.
      const { error: blErr } = await admin
        .from('recruit_blocklist')
        .insert({ device: attempt.device, email: d.email, discord: d.discord, reason: 'test passé', created_by: null })
      if (blErr) {
        console.error('[recrutement] blocklist non posée', blErr.message)
        Sentry.captureException(new Error(`Blocklist non posée pour la tentative ${attempt.id} : ${blErr.message}`))
      }

      const { error: sErr } = await admin.from('recruit_attempts').update({ status: 'soumise' }).eq('id', attempt.id)
      if (sErr) throw new Error(sErr.message)

      return {
        passed: verdict.passed,
        refusalStep: verdict.refusalStep,
        refusalReason: verdict.refusalReason,
        // `discord_link` a `''` pour défaut (0125) : non renseigné ⇒ `null`, l'écran final n'a pas
        // à distinguer « pas pris » de « lien pas encore configuré ».
        discordLink: verdict.passed && config.discordLink ? config.discordLink : null,
      }
    },
  })
}
