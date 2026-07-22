import type { CrmRole, CrmTeam } from '@/lib/types/chatters'

/** Une ligne du classement : un chatteur closing (rôle setter/closer non nul) + ses ventes période. */
export interface ClosingChatterRow {
  id: string
  name: string
  closingRole: CrmRole // 'setter' | 'closer' — non nul (seuls les chatteurs closing sont classés)
  closingTeam: CrmTeam | null // 'rouge' | 'bleue' | null (un setter peut ne pas avoir d'équipe)
  vendu: number
}

export interface StatChatteurData {
  period: string
  /** Comptage de MEMBRES par désignation (indépendant de la période). */
  kpis: { nbSetters: number; nbClosers: number; nbRouge: number; nbBleue: number }
  /** Chatteurs closing, triés par `vendu` décroissant. */
  rows: ClosingChatterRow[]
}
