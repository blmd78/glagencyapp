/**
 * Vocabulaire PARTAGÉ du catalogue de formation (features `training-catalog` — admin — et
 * `training-modules` — lecture) : les sortes de cas et les locuteurs des messages d'ouverture.
 * Miroir des `check` SQL de 0113 (`kind in ('solo','arena','boss')`, `speaker in ('creator','fan')`).
 */
export const CASE_KINDS = ['solo', 'arena', 'boss'] as const
export type CaseKind = (typeof CASE_KINDS)[number]
export const CASE_KIND_LABELS: Record<CaseKind, string> = {
  solo: 'Solo',
  arena: 'Défi simultané',
  boss: 'Boss final',
}

export const SPEAKERS = ['creator', 'fan'] as const
export type Speaker = (typeof SPEAKERS)[number]
export const SPEAKER_LABELS: Record<Speaker, string> = { creator: 'Créatrice', fan: 'Fan' }

// ---------- Entraînement (incrément 2) ----------
export const SESSION_STATUSES = ['active', 'scored', 'failed', 'abandoned'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]
export const THREAD_STATUSES = ['open', 'done', 'lost'] as const
export type ThreadStatus = (typeof THREAD_STATUSES)[number]
export const MESSAGE_SPEAKERS = ['chatter', 'fan'] as const
export type MessageSpeaker = (typeof MESSAGE_SPEAKERS)[number]

/** Chrono de réponse en SOLO (GLA TRAIN_LIMIT_MS = 60 s) ; défi/boss = reaction_max_s du cas. */
export const SOLO_REACTION_S = 60
/** Défi/boss : la réponse du fan est révélée entre 30 et 120 s après l'envoi (GLA), ouvertures échelonnées. */
export const ARENA_REVEAL_MIN_S = 30
export const ARENA_REVEAL_MAX_S = 120
export const ARENA_OPENING_OFFSETS_S = [0, 20, 45, 75, 110] as const

/** Codes de faute grave émis par le fan (`[[ELIM:code]]`, GLA) → thread perdu. */
export const FAULT_CODES = ['interro', 'froid', 'brutal', 'saut', 'spam', 'gratuit', 'remise_prev', 'abandon', 'renc_date', 'force_stop', 'brushoff', 'revente'] as const
export type FaultCode = (typeof FAULT_CODES)[number]
export const isFaultCode = (s: string): s is FaultCode => (FAULT_CODES as readonly string[]).includes(s)
/** Libellés GLA (BOSS_FAULTS + timeout) — affichés sur l'écran « Raté » et sur un thread perdu. */
export const FAULT_LABELS: Record<FaultCode | 'timeout', { title: string; text: string }> = {
  timeout: { title: 'Trop lent', text: 'Tu as dépassé le temps pour répondre. Un fan qu’on fait attendre part voir ailleurs — la réactivité fait partie du métier.' },
  interro: { title: 'Interrogatoire', text: 'Tu as posé plusieurs questions d’affilée façon flic. Le KYC se noie dans la conversation, une info à la fois.' },
  froid: { title: 'Vente à froid', text: 'Tu as sorti le média (ou le sexting) sans l’avoir chauffé. À froid, le fan se braque.' },
  brutal: { title: 'Virage brutal', text: 'Passage au chaud sec / robotique, sans rebondir sur ce qu’il venait de dire.' },
  saut: { title: 'Palier sauté', text: 'Tu as balancé un gros prix d’un coup sans faire monter les paliers.' },
  spam: { title: 'Spam de ventes', text: 'Tu as enchaîné plusieurs médias payants sans le réchauffer entre.' },
  gratuit: { title: 'Gratuit offert', text: 'Tu as donné un média gratuitement sur demande. On ne brade jamais le contenu.' },
  remise_prev: { title: 'Remise préventive', text: 'Tu as baissé ton prix avant même qu’il objecte. Tu casses ta valeur tout seul.' },
  abandon: { title: 'Abandon', text: 'Tu as laissé mourir la conv sur son refus. On relance, on date, on ne lâche pas.' },
  renc_date: { title: 'Rencontre ratée', text: 'Tu as fixé une vraie date, refusé sec ou tué l’espoir. On conditionne, on fait rêver, jamais fixer.' },
  force_stop: { title: 'Forcé après le stop', text: 'Il avait dit qu’il avait fini / plus de budget et tu as re-poussé un média au lieu de passer au relationnel.' },
  brushoff: { title: 'Lâché après la vente', text: 'Tu l’as expédié juste après l’avoir fait payer. Le relationnel post-vente, c’est là que tout se joue.' },
  revente: { title: 'Revente au lieu de rassurer', text: 'Juste après un gros achat, tu es reparti vendre au lieu de le rassurer.' },
}

/** Libellés des médailles (la règle vit dans @glagency/core : medalFor). */
export const MEDAL_LABELS = { or: 'Or', argent: 'Argent', bronze: 'Bronze' } as const

/** Snapshot VISIBLE du cas au moment joué (jsonb `training_sessions.case_snapshot`) — jamais de secret. */
export interface CaseSnapshot {
  code: string; title: string; phase: string; difficulty: number
  context: string; objective: string; objectiveLabel: string; targetLine: string | null
  maxTurns: number; reactionMaxS: number | null; isSale: boolean
  moduleTitle: string; moduleCode: string
}
