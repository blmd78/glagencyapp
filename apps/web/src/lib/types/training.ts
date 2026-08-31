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
// Miroirs des `check` SQL de 0117. Des unions de littéraux et non des tableaux `as const` : rien ne
// les parcourt à l'exécution (aucun `<Select>` ne les propose, la valeur vient toujours de la base
// ou du serveur) — le tableau n'existait que pour dériver le type.
export type SessionStatus = 'active' | 'scored' | 'failed' | 'abandoned'
export type ThreadStatus = 'open' | 'done' | 'lost'
export type MessageSpeaker = 'chatter' | 'fan'

/** Chrono de réponse en SOLO (GLA TRAIN_LIMIT_MS = 60 s) ; défi/boss = reaction_max_s du cas. */
export const SOLO_REACTION_S = 60
/** Défi/boss sans `reaction_max_s` renseigné — repli historique de `dueAtFrom`. */
export const ARENA_REACTION_FALLBACK_S = 120

/**
 * Durée du chrono d'un tour, en secondes. SOURCE UNIQUE, partagée serveur/client : `dueAtFrom`
 * (qui pose `next_due_at`) et l'affichage du chrono s'en servent tous les deux.
 *
 * Sans elle, le client lisait `reaction_max_s` brut — or il est NULL par contrainte SQL sur tout
 * cas solo (`training_cases_reaction_kind`, 0113_formation.sql:103). L'anneau restait donc plein et
 * le chatter se prenait « Trop lent » sans avoir jamais vu tourner les 60 s (régression 6c23446).
 */
export function reactionSecondsFor(kind: CaseKind, reactionMaxS: number | null): number {
  return kind === 'solo' ? SOLO_REACTION_S : (reactionMaxS ?? ARENA_REACTION_FALLBACK_S)
}
/** Défi/boss : la réponse du fan est révélée entre 30 et 120 s après l'envoi (GLA), ouvertures échelonnées. */
export const ARENA_REVEAL_MIN_S = 30
export const ARENA_REVEAL_MAX_S = 120
export const ARENA_OPENING_OFFSETS_S = [0, 20, 45, 75, 110] as const

/**
 * Paliers de prix d'un média verrouillé (GLA serveur.py:507, `ladder`). SOURCE UNIQUE : le prompt du
 * fan du boss lui apprend à monter palier par palier sur CETTE échelle (`bossFanSystemPrompt`), et
 * l'UI ne doit proposer que des prix qu'il connaît — un prix hors échelle déclenche la faute
 * `[[ELIM:saut]]` (« elle saute des paliers »). Ne pas modifier d'un seul côté.
 */
export const MEDIA_PRICE_LADDER = [6, 30, 60, 150, 300, 500] as const

/** Codes de faute grave émis par le fan (`[[ELIM:code]]`, GLA) → thread perdu. */
const FAULT_CODES = ['interro', 'froid', 'brutal', 'saut', 'spam', 'gratuit', 'remise_prev', 'abandon', 'renc_date', 'force_stop', 'brushoff', 'revente'] as const
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
/** Le métal en emoji (repères GLA) — au centre de la jauge de résultat, où un mot ne tiendrait pas. */
export const MEDAL_EMOJI = { or: '🥇', argent: '🥈', bronze: '🥉' } as const

/**
 * Ce qu'une roue révèle, quelle qu'elle soit — la forme MINIMALE dont la cinématique a besoin.
 * La roue nº 1 (encadrant) y projette son `SpinResult` à deux étages (secteur puis lot) ; la roue
 * des modules, qui n'a qu'un étage et aucun perdant, la remplit directement.
 */
export interface WheelReveal {
  won: boolean
  /** Ce qui est annoncé : le lot pour la roue nº 1, le montant pour la roue des modules. */
  label: string
  amountEur: number | null
}

/** Snapshot VISIBLE du cas au moment joué (jsonb `training_sessions.case_snapshot`) — jamais de secret. */
export interface CaseSnapshot {
  code: string; title: string; phase: string; difficulty: number
  // `targetLine` (ligne cible) est VOLONTAIREMENT absente : c'est la réponse attendue du
  // correcteur. Elle est lue directement sur `training_cases` au moment de noter, jamais envoyée au
  // client. Les snapshots écrits avant ce correctif la portent encore — `get-session` la retire.
  context: string; objective: string; objectiveLabel: string
  maxTurns: number; reactionMaxS: number | null; isSale: boolean
  moduleTitle: string; moduleCode: string
  /**
   * Compétence d'origine du cas (`training_module_sections.id`), pour revenir SUR SA LISTE et non
   * en haut du module — GLA faisait déjà ce choix (`index.html:1703`, `sous_cat` → `go3`).
   * `null` = module sans compétences, ou snapshot écrit avant l'ajout du champ (repli sur le module).
   */
  sectionId: string | null
}
