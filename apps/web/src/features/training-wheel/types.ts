import type { WheelPrize, WheelSector } from '@glagency/core'

/**
 * Contrat de la Roue des récompenses. Les montants sont en EUROS (`numeric(8,2)` en base →
 * `Number()` au mapping), `null` = lot non monétaire (day off). Les secteurs/lots eux-mêmes
 * viennent de `@glagency/core` : ce sont les mêmes objets que ceux que `pickWeighted` tire.
 */
export interface WheelConfig {
  title: string
  sectors: WheelSector[]
  prizes: WheelPrize[]
}

/**
 * Ce que la page Roue affiche. Réduit à la config : la page est réservée à l'encadrement, la liste
 * des chatteurs pour qui lancer est chargée séparément (`getSpinnableChatters`) et les tirages se
 * lisent dans l'historique.
 */
export interface WheelData {
  config: WheelConfig
}

/** Une ligne de l'historique encadrant (`paidAt` = versement, branché plus tard côté compta). */
export interface WheelHistoryRow {
  id: string
  profileId: string
  displayName: string
  /** Encadrant qui a lancé le tirage — null pour les tirages d'avant la règle du 2026-08-24. */
  spunByName: string | null
  /**
   * D'où vient le tour : « Encadrant » (roue nº 1, aucun ticket) ou le libellé du ticket consommé
   * (« Module Relance terminé », roue des modules). Les deux roues écrivent dans la même table :
   * sans cette colonne, la compta ne sait plus ce qu'elle paie.
   */
  origine: string
  week: string
  spunAt: string
  won: boolean
  prizeLabel: string | null
  amountEur: number | null
  paidAt: string | null
}

export interface WheelHistory {
  rows: WheelHistoryRow[]
  /** Σ des montants GAGNÉS (les lots non monétaires comptent 0). */
  totalEur: number
  byWeek: { week: string; count: number; totalEur: number }[]
}

/**
 * Résultat d'un tour — décidé par le SERVEUR. `sectorIndex` / `prize.index` servent l'animation :
 * le client fait tourner la roue jusqu'à CE secteur, il ne tire rien lui-même.
 */
export interface SpinResult {
  sectorIndex: number
  sectorLabel: string
  won: boolean
  prize: { index: number; label: string; amountEur: number | null } | null
}

/** Onglets de la page (`?vue=`) — l'historique n'existe que pour `frm-suivi`. */
export type WheelVue = 'roue' | 'historique'
