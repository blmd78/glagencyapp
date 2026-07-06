// Types / forme des props de la feature « stats » (statistiques par modèle).

/** Un jour du graphe : nouveaux abonnés et renouvellements par modèle. */
export interface SubsDay {
  date: string
  /** nom du modèle → nouveaux abonnés du jour. */
  subs: Record<string, number>
  /** nom du modèle → renouvellements du jour (affichés dans le tooltip). */
  renews: Record<string, number>
}

export interface StatsData {
  period: string
  /** Modèles ayant au moins 1 nouvel abonné sur la période, triés par total décroissant. */
  models: { name: string; total: number }[]
  days: SubsDay[]
  totalNew: number
  totalRenew: number
}
