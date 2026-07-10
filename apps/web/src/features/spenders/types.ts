/**
 * Contrat de l'onglet Spenders (CRM closing) — lignes issues de `spender_conversations`
 * (état scrapé /chat/init) enrichies du chatteur résolu (`chatters.mypuls_user_id`).
 */

/** Seuil de tracking (CA net MyPuls) — un fan devient « spender » à partir de là. */
export const CA_TRACKING_SEUIL = 40

/** Ancienneté (jours) au-delà de laquelle une conversation muette devient « à relancer ». */
export const RELANCE_SEUIL_JOURS = 15

/** Compteur de relances au bout duquel on déclenche l'alerte (fin de cycle). */
export const R_ALERTE = 10

/** Jours entiers écoulés depuis une date ISO (null si absente). */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * Un spender est « à relancer » : dernier message de nous, sans réponse ≥ seuil, PAS déjà
 * relancé aujourd'hui, PAS archivé. C'est la file de travail des closers.
 */
export const isARelancer = (
  s: Pick<SpenderRow, 'lastMessageIsMine' | 'lastMessageAt' | 'grise' | 'archived'>,
) =>
  !s.archived &&
  !s.grise &&
  s.lastMessageIsMine === true &&
  (daysSince(s.lastMessageAt) ?? 0) >= RELANCE_SEUIL_JOURS

export interface SpenderRow {
  fanId: number
  username: string
  creatorId: string
  model: string
  /** CA net vie entière connu de MyPuls (scrapé — jamais saisi). LE total du spender. */
  ca: number
  status: string | null
  lastMessageAt: string | null
  /** true = dernier message envoyé par nous (fan silencieux) — candidat relance. */
  lastMessageIsMine: boolean | null
  hasUnread: boolean
  /** Assignation MyPuls brute (label affiché dans MyPuls). */
  assignedLabel: string | null
  /** Chatteur résolu chez nous (via assigned_chatter_id) — null si non mappé. */
  chatterId: string | null
  chatterName: string | null
  chatterTeam: 'rouge' | 'bleue' | null
  // Tracker relances (calculés en SQL par crm_spenders_tracker)
  /** Nombre de relances depuis le dernier reset (0-10+). */
  compteurR: number
  derniereRelanceAt: string | null
  /** Déjà relancé aujourd'hui → grisé (non relançable). */
  grise: boolean
  /** Le fan a reparlé depuis la dernière relance → proposer le reset du compteur. */
  conversionPending: boolean
  archived: boolean
}

export interface SpendersData {
  spenders: SpenderRow[]
  /** Date du dernier passage du scrapper (fraîcheur affichée). */
  capturedAt: string | null
  threshold: number
}
