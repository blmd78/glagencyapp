import type { RevenueScope } from '@/components/revenue-scope-note'

/**
 * Contrat de données de l'onglet Chatteurs.
 * Forme identique à ce que renverra le RPC Supabase (agrégation période sur
 * chatter_daily + chatter_creator_daily) — seul `get-chatters.ts` changera.
 */

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
  team: string | null
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
  /** Modèles assignés (API /users) = le "modele_id" ; peut différer de `models` (= où il a fait du CA). */
  assignedModels: string[]
}

export interface ChattersData {
  period: string
  chatters: ChatterRow[]
  /** Périmètres emboîtés du CA — null en mode restreint (total agence invisible). */
  scope: RevenueScope | null
}
