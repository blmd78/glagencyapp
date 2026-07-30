// Types de la feature « Organisation » (catégorie Équipe) — le board d'orga de l'agence,
// IDENTIQUE à la Google Sheet : Manager | Manager 2 | Modèle | Shift matin | Après-midi |
// Soir | Total chatteurs. Éditable comme le planning repos (cases ComboboxMultiple), en
// WRITE-THROUGH : les cases écrivent les VRAIES données (profile_creators + profiles.shift),
// jamais une copie — Membres et ce board restent une seule et même vérité.
// Colonnes et COULEURS identiques au fichier d'origine (matin #F4CCCC, après-midi #D9EAD3,
// soir #C9DAF8), sans la colonne Statut (retirée à la demande de Benoit).

import type { CrmShift } from '@/lib/types/chatters'

/** Un chatteur affiché dans une case. */
export interface OrgChatter {
  id: string
  name: string
  /** null = shift non renseigné → « à placer ». */
  shift: CrmShift | null
}

/** Une ligne du board = (owner, modèle) : les chatters du modèle groupés par shift.
 *  L'owner est le porteur de l'assignation — le sous-manager, ou le manager (« direct »). */
export interface OrgRow {
  /** Profil qui porte l'assignation du modèle (sous-manager, ou manager si direct). */
  ownerId: string
  /** null = modèle porté par le manager sans sous-manager dédié (« direct »). */
  sousManagerId: string | null
  sousManagerName: string | null
  creatorId: string
  modelName: string
  byShift: Record<CrmShift, OrgChatter[]>
  /** Total = TOUS les chatters assignés au modèle (avec ou sans shift renseigné) — le
   *  compte global des « à placer » vit dans la carte KPI. */
  total: number
}

/** Un groupe = un manager (cellule fusionnée sur ses lignes, comme la sheet). */
export interface OrgSection {
  managerId: string
  managerName: string
  rows: OrgRow[]
  total: number
}

export interface OrganisationData {
  sections: OrgSection[]
  /** Options des cases : tous les membres rôle chatteur. */
  chatterOptions: { id: string; name: string }[]
  /** Options des lignes (édition structurelle, admin). */
  sousManagerOptions: { id: string; name: string }[]
  managerOptions: { id: string; name: string }[]
  modelOptions: { id: string; name: string }[]
  /** Modèles actifs qu'aucune section ne couvre (trous d'assignation, à corriger dans Membres). */
  orphanModels: string[]
  /** Effectifs réels (membres par rôle). */
  counts: {
    managers: number
    sousManagers: number
    modeles: number
    chatteurs: number
    /** Chatteurs sans shift renseigné. */
    aPlacer: number
  }
}
