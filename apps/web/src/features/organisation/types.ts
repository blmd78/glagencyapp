// Types de la feature « Organisation » (catégorie Équipe) — le board d'orga de l'agence,
// IDENTIQUE à la Google Sheet : Manager | Manager 2 | Modèle | Shift matin | Après-midi |
// Soir | Total chatteurs. Éditable comme le planning repos (cases ComboboxMultiple), en
// WRITE-THROUGH : les cases écrivent les VRAIES données (profile_creators, dont les PLACEMENTS
// `shifts` depuis 0110), jamais une copie — Membres et ce board restent une seule et même vérité.
// Colonnes et COULEURS identiques au fichier d'origine (matin #F4CCCC, après-midi #D9EAD3,
// soir #C9DAF8), sans la colonne Statut (retirée à la demande de Benoit).

import type { CrmShift } from '@/lib/types/chatters'

/** Un chatteur affiché dans une case — UNE entrée par PLACEMENT (chatter, modèle, shift) : la même
 *  personne peut figurer dans plusieurs colonnes de la même ligne et sur plusieurs lignes (0110). */
export interface OrgChatter {
  id: string
  name: string
  /** Le shift de la case. */
  shift: CrmShift
  /** Placement marqué HEURE SUP (`profile_creators.hs_shifts`, 0110) → pastille rouge ; sinon
   *  principal → bleue. Une DONNÉE, basculée sur le board (case ouverte, clic sur le nom). */
  hs: boolean
  /** Nouvel arrivant (0101) — icône dans la case ; aucune édition ici, ça se pose dans Membres. */
  isNew: boolean
  arrivedAt: string | null
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
  /** TOUS les chatters assignés au modèle, placés ou non — la table en a besoin pour corriger le total
   *  affiché après un geste (poser quelqu'un déjà assigné n'ajoute personne). */
  assignedIds: string[]
  /** Total = `assignedIds.length` — une personne compte une fois même placée sur deux colonnes ; le
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
  /** Options des cases : tous les membres rôle chatteur. Portent le drapeau « nouvel arrivant »
   *  (0101) et le shift PRINCIPAL de la personne (0110) — sert au type PAR DÉFAUT d'un placement
   *  posé de manière optimiste (heure sup si ≠ principal), le serveur appliquant la même règle. */
  chatterOptions: {
    id: string
    name: string
    isNew: boolean
    arrivedAt: string | null
    principalShift: CrmShift | null
  }[]
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
    /** Chatteurs sans AUCUN placement sur le board. */
    aPlacer: number
  }
}
