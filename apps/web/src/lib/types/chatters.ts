import type { RevenueScope } from '@/lib/types/revenue'

/**
 * Contrat de données de l'onglet Chatteurs.
 * Forme identique à ce que renverra le RPC Supabase (agrégation période sur
 * chatter_daily + chatter_creator_daily) — seul `get-chatters.ts` changera.
 */

// Champs closing CRM (fusion gla-workflow) — miroir des colonnes chatters.role/team/shift.
export const CRM_ROLES = ['closer', 'setter'] as const
export const CRM_TEAMS = ['rouge', 'bleue'] as const
export const CRM_SHIFTS = ['matin', 'aprem', 'soir'] as const
export type CrmRole = (typeof CRM_ROLES)[number]
export type CrmTeam = (typeof CRM_TEAMS)[number]
export type CrmShift = (typeof CRM_SHIFTS)[number]

/** Détail par compte OF (sommable : argent + volume). */
export interface ChatterModel {
  /** id du compte OF (creators.id) — clé stable, deux comptes peuvent partager un nom. */
  creatorId: string
  model: string
  ca: number
  ppv: number
  tips: number
  /** Commission sur ce modèle (ca × barème) — null en mode restreint. */
  com: number | null
  propose: number
  vendu: number
  /** Recalculé Σvendu/Σpropose (jamais la moyenne des %). */
  tauxConv: number
}

/** Ligne chatteur = header agrégé (tous modèles) + détail par modèle. */
export interface ChatterRow {
  id: string
  name: string
  email: string | null
  active: boolean
  /** Nom de la team de management (teams.name via team_id) — ≠ `team` closing rouge/bleue. */
  managementTeam: string | null
  // Closing CRM (édités via le crayon — null = pas dans le dispositif)
  role: CrmRole | null
  team: CrmTeam | null
  shift: CrmShift | null
  // Sommables (= Σ modèles)
  ca: number
  ppv: number
  tips: number
  /** null en mode restreint (com globale non calculable sur un périmètre partiel). */
  com: number | null
  /** null en mode restreint (« proposé » n'existe qu'au grain tous-modèles). */
  propose: number | null
  vendu: number
  // Non sommables (niveau chatteur uniquement) — null en mode restreint (source admin-only)
  tauxConv: number | null
  presenceActiveH: number | null
  presenceIdleH: number | null
  reactiviteS: number | null
  // Ventilation
  /** CA non rattaché à un modèle (identité à résoudre) — 0 si tout est ventilé. */
  caUnattributed: number
  models: ChatterModel[]
}

/** Top du dernier jour ingéré — noms seuls (export partageable sans chiffres). */
export interface DailyRanking {
  date: string
  names: string[]
}

export interface ChattersData {
  period: string
  chatters: ChatterRow[]
  /** null en mode restreint (classement agence complet réservé admin). */
  dailyRanking: DailyRanking | null
  /** Périmètres emboîtés du CA — null en mode restreint (total agence invisible). */
  scope: RevenueScope | null
}
