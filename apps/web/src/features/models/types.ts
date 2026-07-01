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
  total: number
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
