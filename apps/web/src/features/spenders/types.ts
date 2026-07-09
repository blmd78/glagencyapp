/**
 * Contrat de l'onglet Spenders (CRM closing) — lignes issues de `spender_conversations`
 * (état scrapé /chat/init) enrichies du chatteur résolu (`chatters.mypuls_user_id`).
 */

/** Seuil de tracking (CA net MyPuls) — un fan devient « spender » à partir de là. */
export const CA_TRACKING_SEUIL = 40

/** Ancienneté (jours) au-delà de laquelle une conversation muette devient « à relancer ». */
export const RELANCE_SEUIL_JOURS = 15

/** Jours entiers écoulés depuis une date ISO (null si absente). */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/** Un spender est « à relancer » : dernier message de nous, resté sans réponse ≥ seuil. */
export const isARelancer = (s: Pick<SpenderRow, 'lastMessageIsMine' | 'lastMessageAt'>) =>
  s.lastMessageIsMine === true && (daysSince(s.lastMessageAt) ?? 0) >= RELANCE_SEUIL_JOURS

export interface SpenderRow {
  fanId: number
  username: string
  creatorId: string
  model: string
  /** CA net connu de MyPuls (scrapé — jamais saisi). */
  ca: number
  status: string | null
  lastMessageAt: string | null
  /** true = dernier message envoyé par nous (fan silencieux) — candidat relance. */
  lastMessageIsMine: boolean | null
  hasUnread: boolean
  /** Assignation MyPuls brute (label affiché dans MyPuls). */
  assignedLabel: string | null
  /** Chatteur résolu chez nous (via mypuls_user_id) — null si non mappé. */
  chatterName: string | null
  chatterTeam: 'rouge' | 'bleue' | null
}

export interface SpendersData {
  spenders: SpenderRow[]
  /** Date du dernier passage du scrapper (fraîcheur affichée). */
  capturedAt: string | null
  threshold: number
}
