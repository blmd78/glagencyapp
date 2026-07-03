import type { Kpi } from '@/components/kpi-card'
export type { Kpi }

/**
 * Contrat de l'État de santé — tracker d'objectif LTV (repris de l'ancien dashboard) :
 * jauge LTV agence vs cible, plan de rattrapage, répartition par modèle avec chatteurs.
 * LTV = Σca / Σnew_subs. Cible : 10 €/sub (constante, à sortir en config plus tard).
 */

export type LtvStatus = 'sain' | 'moyen' | 'critique'

/** Un chatteur ayant produit sur le modèle (ventilation chatter_creator_daily). */
export interface HealthChatter {
  name: string
  ca: number
  vendu: number
}

export interface ModelHealth {
  id: string
  name: string
  isPrivate: boolean
  /** LTV période (null si aucun nouveau sub). */
  ltv: number | null
  status: LtvStatus | null
  ca: number
  newSubs: number
  renewSubs: number
  /** Part du CA total affiché, en %. */
  part: number
  /** LTV du dernier jour ingéré (null si pas de données ce jour-là). */
  lastDayLtv: number | null
  /** LTV de la semaine calendaire en cours (null si hors période / pas de données). */
  weekLtv: number | null
  /** € manquants sur la période pour atteindre la cible (0 si atteinte). */
  missingToTarget: number
  chatters: HealthChatter[]
}

export interface HealthData {
  periodLabel: string
  /** true = rôle `user` : chiffres RLS-limités à ses modèles (l'UI ré-étiquette). */
  restricted: boolean
  /** Cible LTV (€ / nouvel abonné). */
  target: number
  /** Jauge agence. */
  ltv: number | null
  status: LtvStatus | null
  kpis: Kpi[]
  /** Plan de rattrapage agence (null si cible atteinte ou incalculable). */
  plan: {
    /** Manque à gagner vs l'objectif (= objective − realized). */
    missing: number
    perDay: number
    remainingDays: number
    /** Ce que les nouveaux abonnés auraient rapporté à la cible (cible × subs). */
    objective: number
    /** Ce qu'ils ont réellement rapporté (CA période). */
    realized: number
    subs: number
  } | null
  /** Dernier jour ingéré (YYYY-MM-DD), pour légender les lignes « dernier jour ». */
  lastDay: string | null
  /** Comptes inclus dans le calcul LTV (jauge, plan, KPIs). */
  models: ModelHealth[]
  /** Comptes exclus de la LTV (page Quotas) mais avec des données sur la période — affichés à part. */
  excludedModels: ModelHealth[]
}
