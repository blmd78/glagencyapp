import type { Period } from '@/lib/period'

/** Une ligne du classement : un chatteur qui a généré du CA sur la période. */
export interface RankedChatter {
  id: string
  name: string
  ca: number
  /** 1 = en tête. Rang = position dans la liste triée (pas d'ex æquo). */
  rank: number
}

export interface StatChatteurData {
  /** Bornes (clé des confettis, nom du fichier exporté) + libellé humain. */
  period: Period
  /** Chatteurs avec du CA sur la période, triés par CA décroissant. */
  rows: RankedChatter[]
}
