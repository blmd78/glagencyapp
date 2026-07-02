import type { RevenueScope } from '@/components/revenue-scope-note'

/**
 * Contrat de données de l'onglet Chatteurs.
 * Forme identique à ce que renverra le RPC Supabase (agrégation période sur
 * chatter_daily + chatter_creator_daily) — seul `get-chatters.ts` changera.
 */

/** Détail par modèle (sommable : argent + volume). */
export interface ChatterModel {
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
  team: string | null
  // Sommables (= Σ modèles)
  ca: number
  ppv: number
  tips: number
  com: number
  propose: number
  vendu: number
  // Non sommables (niveau chatteur uniquement)
  tauxConv: number
  presenceActiveH: number
  presenceIdleH: number
  reactiviteS: number | null
  // Ventilation
  nbModels: number
  /** CA non rattaché à un modèle (identité à résoudre) — 0 si tout est ventilé. */
  caUnattributed: number
  models: ChatterModel[]
  /** Modèles assignés (API /users) = le "modele_id" ; peut différer de `models` (= où il a fait du CA). */
  assignedModels: string[]
}

export interface ChattersData {
  period: string
  chatters: ChatterRow[]
  /** Périmètres emboîtés du CA (attribué ⊂ messagerie ⊂ total agence) pour la période. */
  scope: RevenueScope
}
