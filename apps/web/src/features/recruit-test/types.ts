import type { QiQuestion } from '@glagency/core'

/**
 * Contrats de retour des Server Actions publiques du test (`/postuler`). Règle qui gouverne tout ce
 * fichier, SANS exception : **aucun chiffre de notation ne descend au client**. Ni la clé de
 * correction QI (elle reste dans `recruit_attempts.qi_answers`), ni les seuils du verdict
 * (`frappe_min`, `connexion_min`, `qi_min`, `global_threshold`), ni le score QI, ni le total du
 * bot, ni le détail de ses 4 axes. Le candidat reçoit une progression, puis une réussite ou une
 * raison QUALITATIVE de refus, comme chez GLA.
 *
 * Ce que le parcours reçoit à la place, c'est le strict nécessaire pour avancer : « c'est
 * enregistré », « c'est noté ». Les scores restent en base, où le verdict et l'agence les lisent.
 */

/** Ce dont `TestFlow` a besoin pour dérouler tout le parcours après `startAttempt`. */
export interface StartedAttempt {
  attemptId: string
  /** Prénom du persona client (Lucas / Marco / David) — affiché en tête du chat. */
  persona: string
  /** 5 questions tirées, SANS la bonne réponse. */
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
 * Notation faite — un accusé, rien d'autre. Le total sur 100 et les 4 axes sont écrits sur la
 * tentative et ne servent qu'au verdict (`computeVerdict`) et au dossier côté agence.
 */
export interface ScoreDone {
  done: true
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
