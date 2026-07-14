/**
 * Contrat de l'onglet Spenders (CRM closing) — lignes issues de `spender_conversations`
 * (état scrapé /chat/init) enrichies du chatteur résolu (`chatters.mypuls_user_id`).
 */

/** Seuil de tracking (CA net MyPuls) — un fan devient « spender » à partir de là. */
export const CA_TRACKING_SEUIL = 40

/** Compteur de relances au bout duquel on déclenche l'alerte / l'archivage (fin de cycle). */
export const R_ALERTE = 10

/** Jours entiers écoulés depuis une date ISO (null si absente). */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * Jours CALENDAIRES Europe/Paris écoulés — la cadence relance est calendaire Paris
 * (jour_paris en base), pas en heures glissantes : une relance avant-hier 18h est
 * « en retard » dès ce matin, pas à 18h.
 */
export function parisDaysSince(iso: string | null): number | null {
  if (!iso) return null
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })
  const dayUTC = (d: Date) => Date.parse(`${fmt.format(d)}T00:00:00Z`)
  return Math.round((dayUTC(new Date()) - dayUTC(new Date(iso))) / 86_400_000)
}

/**
 * File de travail « à relancer aujourd'hui » : spender actif, PAS déjà relancé aujourd'hui
 * (non grisé), cycle PAS terminé (R < 10). Gestion manuelle : le closer coche une relance/jour.
 * À R10 le spender bascule en alertes (à archiver), donc sort de cette file.
 */
export const isARelancer = (s: Pick<SpenderRow, 'grise' | 'archived' | 'compteurR'>) =>
  !s.archived && !s.grise && s.compteurR < R_ALERTE

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
