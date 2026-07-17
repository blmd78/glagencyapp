/**
 * Périmètres emboîtés du CA sur la période sélectionnée (calculés en base, pas de constante).
 * `attributed` = total onglet Chatteurs (Σ chatter_daily : PPV+Tips attribués à un chatteur).
 * `messaging`  = messagerie tous comptes (Σ creator_daily PPV+Tips).
 * `allAccounts`= total onglet Modèles = total MyPuls (Σ creator_daily, tous types).
 */
export interface RevenueScope {
  attributed: number
  messaging: number
  allAccounts: number
}
