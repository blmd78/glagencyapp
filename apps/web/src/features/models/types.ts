/** Contrat de données de l'onglet Modèles (façon "page équipe" du CRM). */

export interface ModelChatter {
  name: string
  ca: number
  ppv: number
  tips: number
  propose: number
  vendu: number
  tauxConv: number
}

export interface ModelRow {
  id: string
  name: string
  /** CA total du compte (tous types) — colonne autoritaire (= MyPuls). */
  total: number
  /** Nouveaux abonnés sur la période. */
  newSubs: number
  /** Renouvellements (nombre). */
  renouv: number
  /** Ventes (PPV+MOD+PUSH+TIPS, nombre). */
  ventes: number
  /** CA messagerie+médias (PPV+MOD+PUSH+TIPS). */
  caMsg: number
  /** LTV / nouvel abonné. */
  ltv: number
  /** Part du CA total (%). */
  part: number
  ppv: number
  tips: number
  renew: number
  /** Chatteurs avec CA>0 (recalculé). */
  active: number
  /** Chatteurs assignés (membres). */
  planned: number
  /** CA moyen / chatteur actif. */
  per: number
  nbChatters: number
  chatters: ModelChatter[]
  /** Compte privé (carlaprive/juliepvv/alice_prvv) : total connu, détail chatteur indisponible. */
  isPrivate: boolean
}

export interface ModelsData {
  period: string
  models: ModelRow[]
}
