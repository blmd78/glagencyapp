// État du parcours `/postuler` tel qu'il SURVIT à un rechargement de page, et son accès au
// stockage du navigateur. Module sans composant (voisin des hooks `use-*.ts` de
// `training-session/components/`) : il porte la forme persistée, donc les deux types que
// `TestFlow` et l'étape chat se partagent.
//
// POURQUOI persister : `startAttempt` est plafonné à 5 tentatives par IP et par 24 h. Un candidat
// qui recharge, qui perd le réseau ou qui revient sur la page ne doit PAS brûler une tentative —
// la reprise est donc la règle, et `startAttempt` n'est appelé que s'il n'y a rien à reprendre.
//
// Le VERDICT final est persisté à part (`RESULT_KEY`) : le parcours, lui, est effacé dès la
// soumission. Un candidat reçu qui recharge la page doit retrouver son lien Discord — sans ça il
// tomberait sur « Tu as déjà passé le test », son seul livrable perdu.
//
// Ce qui n'est PAS ici : le moindre élément de barème (la correction QI, les seuils et les notes
// restent serveur) — le verdict stocké est celui que le serveur a déjà rendu, sans chiffre.

import { z } from 'zod'
import type { SubmitResult } from '../types'

/** Clé de session : le parcours en cours. Effacée à l'écran final. */
const FLOW_KEY = 'recrutement'
/** Clé de session : le verdict rendu, pour que l'écran final survive à un rechargement. */
const RESULT_KEY = 'recrutement-resultat'
/** Clé PERSISTANTE (localStorage) : identifie le navigateur pour la blocklist « un seul essai ». */
const DEVICE_KEY = 'recrutement-device'

// Le sessionStorage est éditable à la main : ce qu'on relit est du JSON hostile, pas notre état.
// Une forme invalide n'est pas rattrapable (on ne sait pas où en est le candidat) → on efface et
// on repart de l'intro, ce qui est sans risque : la tentative abandonnée reste côté serveur.
//
// Ce schéma est la SEULE description de l'état persisté : `FlowState` en est déduit (`z.infer`).
// Le redéclarer à la main laissait deux formes dériver l'une de l'autre en silence — un champ
// ajouté au type sans l'être au schéma se serait fait effacer à la relecture, sans erreur.
const storedFlow = z.object({
  attemptId: z.uuid(),
  /** Les étapes qui ont une tentative derrière elles (l'intro et l'écran final n'en ont pas). */
  step: z.enum(['qi', 'typing', 'connection', 'bot', 'identity']),
  persona: z.string(),
  /** Les 5 questions tirées par le serveur — SANS la bonne réponse (`QiQuestion` de core). */
  qi: z.array(z.object({ slot: z.string(), q: z.string(), opts: z.array(z.string()) })),
  typingText: z.string(),
  qiTimer: z.number(),
  botMessages: z.number(),
  answers: z.array(z.number().nullable()),
  chat: z.array(
    z.object({
      speaker: z.enum(['candidat', 'client']),
      body: z.string(),
      /** Renseigné quand le message est un média verrouillé envoyé par le candidat. */
      mediaPrice: z.number().optional(),
    }),
  ),
  /**
   * Échéance ABSOLUE (ms epoch) de la question QI en cours — persistée avec les réponses, sinon un
   * F5 rendrait 30 s neuves à chaque question, autant de fois que voulu. `null` = pas de question
   * en cours (avant l'épreuve). Absent = session ouverte AVANT que ce champ existe : `null`, et
   * `readFlow` en fabrique une neuve ci-dessous. Une échéance dans le passé, elle, fait expirer la
   * question en cours.
   */
  qiDeadline: z.number().nullable().default(null),
})

export type FlowState = z.infer<typeof storedFlow>
export type FlowStep = FlowState['step']
/** Un message de la conversation avec le client IA, côté affichage. */
export type ChatMessage = FlowState['chat'][number]

/**
 * Le verdict tel qu'il est relu après un rechargement. Même règle que le parcours : du JSON hostile
 * jusqu'à preuve du contraire — une forme invalide est effacée, l'écran repart de l'intro (le
 * serveur, lui, refusera une 2e soumission). `satisfies z.ZodType<SubmitResult>` : la forme relue
 * est vérifiée par le compilateur contre le contrat de `submitCandidate`, elle ne peut plus en
 * diverger sans erreur de build.
 */
const storedResult = z.object({
  passed: z.boolean(),
  refusalStep: z.string().nullable(),
  refusalReason: z.string().nullable(),
  discordLink: z.string().nullable(),
}) satisfies z.ZodType<SubmitResult>

/** Parcours en cours, ou `null` (rien de stocké, stockage indisponible, ou contenu corrompu). */
export function readFlow(): FlowState | null {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY)
    if (!raw) return null
    const parsed = storedFlow.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      sessionStorage.removeItem(FLOW_KEY)
      return null
    }
    const flow = parsed.data
    // Session ouverte avant que le chrono soit persisté : on lui accorde une échéance neuve, UNE
    // fois (elle part en `sessionStorage` au rendu suivant). Sans ça, la question en cours serait
    // comptée expirée sur un rechargement qui n'a rien de fautif.
    if (flow.step === 'qi' && flow.qiDeadline === null) flow.qiDeadline = Date.now() + flow.qiTimer * 1000
    return flow
  } catch {
    // Navigation privée / stockage bloqué : le test reste jouable, il ne survivra juste pas à un
    // rechargement.
    return null
  }
}

export function writeFlow(flow: FlowState): void {
  try {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow))
  } catch {
    /* stockage indisponible — sans effet sur le déroulé */
  }
}

export function clearFlow(): void {
  try {
    sessionStorage.removeItem(FLOW_KEY)
  } catch {
    /* idem */
  }
}

/** Verdict déjà rendu à ce candidat dans cet onglet, ou `null`. */
export function readResult(): SubmitResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY)
    if (!raw) return null
    const parsed = storedResult.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      sessionStorage.removeItem(RESULT_KEY)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

/**
 * À écrire AVANT `clearFlow()` : entre les deux, un rechargement laisserait le candidat sans
 * parcours ET sans verdict.
 */
export function writeResult(result: SubmitResult): void {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result))
  } catch {
    /* idem — l'écran final s'affiche, il ne survivra juste pas à un rechargement */
  }
}

/**
 * Identifiant de navigateur : posé une fois, gardé (localStorage) — c'est lui qui alimente la
 * blocklist « un seul essai ». Charset UUID = compatible avec le `regex` de `startAttemptInput`.
 * Stockage indisponible → un UUID neuf à chaque visite : le test reste jouable, seul le blocage
 * par navigateur devient inopérant (l'e-mail et le Discord le rattrapent à la soumission).
 */
export function deviceId(): string {
  const fresh = crypto.randomUUID()
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    localStorage.setItem(DEVICE_KEY, fresh)
  } catch {
    /* stockage bloqué — on rend l'identifiant volatil ci-dessous */
  }
  return fresh
}
