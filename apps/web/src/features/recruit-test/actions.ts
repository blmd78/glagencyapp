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
import { createAdminClient, type Database } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import { RECRUIT_PERSONA_NAMES } from '@/lib/ai/recruit-prompts'
import { saveConnectionInput, saveQiInput, saveTypingInput, startAttemptInput, submitCandidateInput } from './schema'
import {
  ATTEMPT_OVER,
  BLOCKED,
  CLOSED,
  STEPS_MISSING,
  anyBlocklistMatch,
  clientIp,
  enforceIpRateLimit,
  loadAttempt,
  readConfig,
  requireInProgress,
  toAnswerKey,
  toQiBank,
  toTyping,
  type Admin,
  type Attempt,
} from './shared'
import type { StartedAttempt, SubmitResult } from './types'

const ALREADY_SENT = 'Ce test a déjà été envoyé.'
/** Chrono QI dépassé — refus GÉNÉRIQUE : la fenêtre réelle ne descend pas plus que les seuils. */
const QI_EXPIRED = 'Temps écoulé — recommence le test.'
/**
 * Le nombre de réponses envoyées ne correspond pas au questionnaire tiré pour cette tentative.
 * Générique EXPRÈS : le message ne dit ni combien de questions on attendait, ni pourquoi (banque
 * éditée entre-temps sur un vieil onglet, ou envoi forgé) — c'est la même règle que les seuils.
 */
const QI_MISMATCH = 'Réponses incomplètes — recommence le test.'

/** Les trois colonnes d'épreuve écrites UNE fois par tentative (QI, frappe, connexion). */
type OnceColumn = 'qi_score' | 'typing' | 'connection_mbps'

/**
 * Écriture IDEMPOTENTE d'une épreuve : `.eq('status','en_cours').is(col, null)` rend l'update
 * atomique — deux appels concurrents (double envoi, rejeu après une réponse HTTP perdue) ne peuvent
 * pas se départager sur la meilleure valeur, la PREMIÈRE écriture fait foi.
 *
 * 0 ligne touchée n'est donc pas forcément une erreur : si la valeur est déjà en base, c'est la
 * course perdue contre l'autre appel — un SUCCÈS du point de vue du candidat (refuser
 * l'enfermerait sur un « Réessayer » qui ne peut jamais aboutir). Ce n'est une vraie panne que si
 * rien n'est persisté ET que la tentative est encore ouverte : là on lève, pour que l'épreuve ne
 * disparaisse pas en silence.
 */
async function writeOnce(
  admin: Admin,
  attemptId: string,
  column: OnceColumn,
  patch: Database['public']['Tables']['recruit_attempts']['Update'],
  lostLabel: string,
): Promise<void> {
  const { data, error } = await admin
    .from('recruit_attempts')
    .update(patch)
    .eq('id', attemptId)
    .eq('status', 'en_cours')
    .is(column, null)
    .select('id')
  if (error) throw new Error(error.message)
  if (data.length > 0) return
  const persisted: Attempt = await loadAttempt(admin, attemptId)
  if (persisted[column] !== null) return
  requireInProgress(persisted)
  throw new Error(`${lostLabel} perdue sur la tentative ${attemptId}`)
}

/**
 * Fin de la fenêtre pendant laquelle une correction QI est encore acceptée : `questions` ×
 * `qi_timer`, plus 120 s de marge — latence, lecture de la consigne, onglet qui reprend la main.
 * Sans ce calcul SERVEUR, le chrono n'existait que côté client : horloge du poste, `sessionStorage`
 * éditable ou onglet suspendu rendaient du temps gratuit sur des questions dont le barème compte
 * pour 30 points du verdict.
 *
 * `questions` est le N de LA TENTATIVE (longueur de sa clé de correction), jamais la taille de la
 * banque du jour : un admin qui ajoute des questions pendant qu'un candidat joue ne doit ni lui
 * offrir du temps, ni lui en retirer.
 */
function qiDeadlineMs(createdAt: string, qiTimer: number, questions: number): number {
  return Date.parse(createdAt) + (questions * qiTimer + 120) * 1000
}

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
      if (await anyBlocklistMatch(admin, [['device', d.device], ['ip', ip]])) throw new BusinessError(BLOCKED)
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
 * Une seule correction par tentative (`writeOnce`).
 *
 * Le CHRONO est vérifié ici aussi (`qiDeadlineMs`) : côté client il ne tient qu'à l'échéance
 * persistée dans `sessionStorage`, que rien n'empêche de repousser. Le score n'est RIEN rendu au
 * client (cf. `types.ts`) — il reste en base pour le verdict.
 */
export async function saveQi(raw: unknown): Promise<ActionResult<void>> {
  return runAction({
    schema: saveQiInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<void> => {
      const admin = createAdminClient()
      // Deux lectures indépendantes → en parallèle (l'ordre des VÉRIFICATIONS ne change pas).
      const [attempt, config] = await Promise.all([loadAttempt(admin, d.attemptId), readConfig(admin)])
      requireInProgress(attempt)
      // REJEU d'une correction DÉJÀ commitée (réponse HTTP perdue, rechargement pendant la
      // requête) : c'est un succès, et il est servi AVANT le chrono — un rejeu tardif d'un envoi
      // qui a réussi ne doit pas se transformer en « temps écoulé ». La première correction fait
      // foi, celle qu'on vient de recevoir est ignorée (anti-rejeu : pas de second passage pour
      // un meilleur score).
      if (attempt.qi_score !== null) return

      // La clé de correction de CETTE tentative fait foi, pas la banque du jour : elle donne le
      // nombre de questions réellement servies, donc le chrono ET le nombre de réponses attendues.
      // Une longueur différente = un envoi qui ne correspond pas au questionnaire tiré (vieil
      // onglet dont la banque a changé, ou payload forgé) : refus générique, pas de correction
      // partielle sur un questionnaire qu'on ne peut plus recomposer.
      const answerKey = toAnswerKey(attempt.qi_answers)
      if (d.answers.length !== answerKey.length) throw new BusinessError(QI_MISMATCH)
      if (Date.now() > qiDeadlineMs(attempt.created_at, config.qiTimer, answerKey.length)) {
        throw new BusinessError(QI_EXPIRED)
      }

      const qiScore = gradeQi(answerKey, d.answers)
      await writeOnce(admin, attempt.id, 'qi_score', { qi_score: qiScore }, 'Correction QI')
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
      await writeOnce(
        admin,
        attempt.id,
        'typing',
        { typing: { wpm: d.wpm, accuracy: d.accuracy, seconds: d.seconds } },
        'Mesure de frappe',
      )
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
      await writeOnce(admin, attempt.id, 'connection_mbps', { connection_mbps: Math.round(d.mbps * 10) / 10 }, 'Mesure de connexion')
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
      // Deux lectures indépendantes → en parallèle (l'ordre des VÉRIFICATIONS ne change pas).
      const [attempt, config] = await Promise.all([loadAttempt(admin, d.attemptId), readConfig(admin)])
      if (attempt.status === 'soumise') throw new BusinessError(ALREADY_SENT)
      if (attempt.status !== 'notee') {
        throw new BusinessError(attempt.status === 'en_cours' ? STEPS_MISSING : ATTEMPT_OVER)
      }

      // « Un seul essai », volet SOUMISSION : e-mail et Discord (device/IP l'ont été à l'entrée).
      if (await anyBlocklistMatch(admin, [['email', d.email], ['discord', d.discord]])) throw new BusinessError(BLOCKED)

      // 2e passage : l'e-mail porte déjà un dossier. On n'interdit pas — on marque, l'agence tranche.
      const { data: previous, error: pErr } = await admin.from('recruit_candidates').select('id').eq('email', d.email).limit(1)
      if (pErr) throw new Error(pErr.message)

      const typing = toTyping(attempt.typing)
      const { qi_score: qi, connection_mbps: mbps, orthographe, coherence, relance, vente, bot_total: botTotal } = attempt
      if (qi === null || mbps === null || orthographe === null || coherence === null || relance === null || vente === null || botTotal === null) {
        throw new BusinessError(STEPS_MISSING)
      }
      // Barème de la logique = le questionnaire RÉELLEMENT servi (longueur de la clé de
      // correction), pas la banque du jour : un admin qui ajoute une question pendant la
      // conversation ne doit pas changer le verdict d'un test déjà passé. Le total part aussi en
      // base (`qi_total`) pour que la fiche affiche « 4/5 » et non « 4 » sur un dénominateur perdu.
      const qiTotal = toAnswerKey(attempt.qi_answers).length
      const verdict = computeVerdict({
        qi,
        qiTotal,
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
        age: d.age,
        location: d.location,
        phone: d.phone,
        shifts: d.shifts,
        source: d.source,
        qi_score: qi,
        qi_total: qiTotal,
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
