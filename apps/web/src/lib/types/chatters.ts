import type { RevenueScope } from '@/lib/types/revenue'

/**
 * Contrat de données de l'onglet Chatteurs.
 * Forme identique à ce que renverra le RPC Supabase (agrégation période sur
 * chatter_daily + chatter_creator_daily) — seul `get-chatters.ts` changera.
 */

// Constantes closing CRM. `CRM_ROLES`/`CRM_TEAMS` = valeurs de `profiles.closing_role`/`closing_team`
// (le closing est porté par le membre, 0077 ; `chatters.role`/`team` droppées en 0080). `CRM_SHIFTS`
// = valeurs de `chatters.shift` (toujours édité côté Chatteurs).
// QUATRE valeurs depuis le 2026-07-28 (migration 0090) : la légende de la feuille de paie du
// propriétaire connaît `nouveau` (🔴) et « chatteurs hybrides » en plus de setter/closer, et le
// `check` de `profiles.closing_role` les accepte désormais. Élargir ICI est ce qui rend Membres
// capable de les PRODUIRE (`z.enum(CRM_ROLES)` dans `features/members/schema.ts`, `SelectItem` dans
// `member-closing-fields.tsx`) et de les AFFICHER (`components/role-badge.tsx`).
// ⚠️ Les trois consommateurs indexent sur cette constante par `Record<CrmRole, …>` : ajouter une
// valeur ici SANS compléter leurs tables ne compile pas. C'est voulu — jusqu'au 2026-07-28,
// `RoleBadge` étiquetait « Setter » toute valeur ≠ `'closer'`, donc un `'nouveau'` posé en SQL
// se serait affiché FAUX plutôt qu'absent.
export const CRM_ROLES = ['closer', 'setter', 'hybride', 'nouveau'] as const
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
  /** Nom de la team de management (teams.name via team_id) — ≠ `closingTeam` rouge/bleue. */
  managementTeam: string | null
  // Shift (matin/aprem/soir), édité via le crayon — null = non renseigné.
  // Rôle (setter/closer) et équipe (rouge/bleue) sont désormais gérés sur le MEMBRE.
  shift: CrmShift | null
  // Closing lu DEPUIS le membre lié (profiles.closing_role/closing_team via profiles.chatter_id) —
  // read-only ici ; l'édition est sur la fiche Membre. null = chatteur non lié / sans désignation.
  closingRole: CrmRole | null
  closingTeam: CrmTeam | null
  // Sommables (= Σ modèles)
  ca: number
  ppv: number
  tips: number
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
