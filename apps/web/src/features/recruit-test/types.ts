import type { QiQuestion } from '@glagency/core'

/**
 * Contrats de retour des Server Actions publiques du test (`/postuler`), et les quelques LITTÉRAUX
 * que le client et le serveur doivent lire à l'identique. Règle qui gouverne tout ce
 * fichier, SANS exception : **aucun chiffre de notation ne descend au client**. Ni la clé de
 * correction QI (elle reste dans `recruit_attempts.qi_answers`), ni les seuils du verdict
 * (`frappe_min`, `connexion_min`, `qi_min`, `global_threshold`), ni le score QI, ni le total du
 * bot, ni le détail de ses 4 axes. Le candidat reçoit une progression, puis une réussite ou une
 * raison QUALITATIVE de refus, comme chez GLA.
 *
 * Ce que le parcours reçoit à la place, c'est le strict nécessaire pour avancer : « c'est
 * enregistré », « c'est noté ». Les scores restent en base, où le verdict et l'agence les lisent.
 *
 * ⚠️ Ce module est le SEUL que le client (`TestFlow`) et le serveur (`actions*.ts`, `shared.ts`)
 * importent tous les deux : il ne doit JAMAIS importer un module serveur (`next/headers`,
 * `@glagency/db`, `@/lib/actions`…). C'est ce qui l'a désigné pour porter les littéraux ci-dessous
 * — un fichier `'use server'` ne peut exporter que des fonctions async, et `shared.ts` importe
 * `next/headers` : les deux côtés recopiaient donc ces chaînes à la main, « à garder en phase ».
 */

/** Tentative inconnue (base purgée, vieil onglet qui rejoue un identifiant) — le parcours repart. */
export const NO_ATTEMPT = 'Test introuvable — recommence depuis le début.'
/**
 * Refus levé sur un 23505 (`unique (attempt_id, position)`) : le message EST en base, c'est le
 * RENVOI qui est refusé. Le client s'en sert pour NE PAS retirer de l'écran un message qui existe
 * côté serveur et que la notation lira.
 */
export const BOT_ALREADY_SENT = 'Message déjà envoyé.'
/**
 * Le serveur ne prendra plus aucun message sur cette tentative. Le client s'en sert pour basculer
 * sur la notation au lieu d'un toast sans issue (cas réel : l'admin baisse `bot_messages` pendant
 * un test — `flow.botMessages` a été figé au démarrage, l'écran laisse la saisie ouverte).
 */
export const CHAT_OVER = 'La conversation est terminée.'

/**
 * Corps d'un message « média verrouillé » (mécanique GLA : le média est un message à part entière).
 * Écrit par `sendToBot` en base, affiché tel quel par le parcours, et RELU par le prompt de
 * notation (`lib/ai/recruit-prompts.ts`, qui décrit ce format au modèle) : les trois doivent
 * s'accorder au caractère près.
 */
export const mediaLabel = (price: number) => `[MEDIA VERROUILLE - ${price}€]`

/** Ce dont `TestFlow` a besoin pour dérouler tout le parcours après `startAttempt`. */
export interface StartedAttempt {
  attemptId: string
  /** Prénom du persona client (Lucas / Marco / David) — affiché en tête du chat. */
  persona: string
  /** Les questions tirées (1 à 20 selon la banque), SANS la bonne réponse. */
  qi: QiQuestion[]
  typingText: string
  /** Secondes par question (config `qi_timer`). */
  qiTimer: number
  /** Nombre d'échanges avec le client avant la fin (config `bot_messages`). */
  botMessages: number
}

/** Un tour de conversation : la réponse du client, et `done` quand le plafond d'échanges est atteint. */
export interface BotTurn {
  reply: string
  done: boolean
}

/**
 * Verdict rendu au candidat. `refusalStep`/`refusalReason` sont qualitatifs (l'épreuve la plus
 * faible, jamais un chiffre) et valent `null` en cas de réussite ; `discordLink` n'est renseigné
 * QUE si le candidat est pris.
 */
export interface SubmitResult {
  passed: boolean
  refusalStep: string | null
  refusalReason: string | null
  discordLink: string | null
}
