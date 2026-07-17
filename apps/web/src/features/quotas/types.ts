// Types / forme des props de la feature « quotas ».

/** Seuils journaliers d'une équipe. Higher-is-better partout SAUF reactiviteS (lower-is-better). */
export interface QuotaValues {
  /** Présence attendue, en heures/jour. */
  presenceH: number
  /** Réactivité maximale tolérée, en secondes/jour (plus bas = mieux). */
  reactiviteS: number
  /** Médias proposés attendus, par jour. */
  mediasProposes: number
  /** Taux de conversion attendu, en %/jour. */
  convPct: number
  /** CA attendu, en €/jour. */
  caEur: number
}

/** Une ligne du tableau d'édition : une équipe (= modèle) et ses seuils, s'ils existent. */
export interface QuotaTeamRow {
  teamId: string
  teamName: string
  /** null = quotas non configurés (l'équipe est ignorée par les cartes Analyses). */
  quota: QuotaValues | null
}

/** Un compte OF et son flag d'exclusion du calcul LTV (le CA global compte tout). */
export interface ExclusionAccountRow {
  creatorId: string
  name: string
  /** true = exclu du calcul LTV (page Santé) UNIQUEMENT — CA global et autres chiffres comptent tout. */
  excluded: boolean
  /** Compte privé (carlaprive…) — affiché avec un badge pour contexte. */
  isPrivate: boolean
}

export interface QuotasData {
  teams: QuotaTeamRow[]
  accounts: ExclusionAccountRow[]
}
