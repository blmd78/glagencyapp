import type { QiQuestion } from '@glagency/core'

/**
 * Contrats de retour des Server Actions publiques du test (`/postuler`). Règle qui gouverne tout ce
 * fichier : **rien de secret ne descend au client**. Pas la clé de correction QI (elle reste dans
 * `recruit_attempts.qi_answers`), pas les seuils du verdict (`frappe_min`, `connexion_min`,
 * `qi_min`, `global_threshold`), pas le score global ni les notes du bot — le candidat reçoit une
 * réussite ou une raison QUALITATIVE de refus, comme chez GLA.
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

/**
 * Score QI corrigé côté serveur. Rendu pour l'état interne du parcours (l'UI décide de l'afficher
 * ou non — GLA ne le montrait pas au candidat).
 */
export interface QiResult {
  qiScore: number
}

/** Un tour de conversation : la réponse du client, et `done` quand le plafond d'échanges est atteint. */
export interface BotTurn {
  reply: string
  done: boolean
}

/** Notation du bot — le TOTAL sur 100 seulement (les 4 axes restent côté agence). */
export interface ScoreResult {
  total: number
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
