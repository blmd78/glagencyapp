import type { WheelPrize } from '@glagency/core'

/**
 * Roue des MODULES — celle du chatter (0136). Un étage : le secteur EST le montant, et tous les
 * secteurs sont gagnants. Les segments réutilisent `WheelPrize` (label / weight / amountEur), qui
 * a exactement la forme du jsonb de `training_module_wheel_config.segments`.
 */
export interface ModuleWheelConfig {
  title: string
  segments: WheelPrize[]
}

/** État du tour d'un module, du point de vue du chatter. */
export type ModuleTourEtat = 'a_gagner' | 'gagne' | 'joue'

export interface ModuleWheelModule {
  id: string
  code: string
  title: string
  emoji: string | null
  /** Cas ACTIFS du module. */
  total: number
  /** Cas validés à ≥ 60 sur une session jouée ICI (l'import GLA ne compte pas — D5). */
  valides: number
  etat: ModuleTourEtat
}

/** Un tirage passé du visiteur. */
export interface ModuleWheelSpin {
  id: string
  spunAt: string
  label: string
  amountEur: number | null
  /** « Module Relance terminé » — le libellé du ticket consommé. */
  reason: string | null
}

export interface ModuleWheelData {
  config: ModuleWheelConfig
  /** Tours disponibles = tickets de module non utilisés. */
  tours: number
  modules: ModuleWheelModule[]
  spins: ModuleWheelSpin[]
  /** Σ des montants déjà gagnés par le visiteur sur CETTE roue. */
  totalEur: number
}

/**
 * Résultat d'un tour — décidé par le SERVEUR. `segmentIndex` sert l'animation : le client fait
 * tourner la roue jusqu'à CE secteur, il ne tire rien lui-même.
 */
export interface ModuleSpinResult {
  segmentIndex: number
  label: string
  amountEur: number | null
}
