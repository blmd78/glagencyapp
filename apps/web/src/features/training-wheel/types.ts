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
 * Un tirage de l'utilisateur courant (`prizeLabel`/`amountEur` null si Raté). `paidAt` = versement
 * (branché plus tard côté compta) — le chatter voit « payé » ou « à venir » sur SES gains.
 */
export interface MySpin {
  id: string
  week: string
  spunAt: string
  sectorLabel: string
  won: boolean
  prizeLabel: string | null
  amountEur: number | null
  paidAt: string | null
}

/**
 * Tout ce que la page Roue affiche au VISITEUR : la config et ses propres gains. Le droit de lancer
 * un tirage (`canSpin` côté page) vient de `hasPageAccess('frm-suivi')`, pas d'ici — et la liste
 * des chatteurs pour qui lancer est chargée séparément (`getSpinnableChatters`).
 */
export interface WheelData {
  config: WheelConfig
  mySpins: MySpin[]
}

/** Une ligne de l'historique encadrant (`paidAt` = versement, branché plus tard côté compta). */
export interface WheelHistoryRow {
  id: string
  profileId: string
  displayName: string
  /** Encadrant qui a lancé le tirage — null pour les tirages d'avant la règle du 2026-08-24. */
  spunByName: string | null
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
