// Types de la feature « Organisation » (catégorie Équipe) — la vue d'orga de l'agence :
// manager → sous-managers → modèles → chatters par shift (miroir de la Google Sheet
// « organisation », demande Benoit 2026-07-29).

import type { CrmShift } from '@/lib/types/chatters'

/** Un chatteur affiché dans une case : nom + shift résolu via son lien MyPuls. */
export interface OrgChatter {
  id: string
  name: string
  /** null = membre non lié à un chatteur MyPuls, ou chatteur sans shift renseigné. */
  shift: CrmShift | null
}

/** Une ligne de l'orga = (sous-manager, modèle) : les chatters du modèle groupés par shift. */
export interface OrgRow {
  /** null = modèle porté par le manager sans sous-manager dédié. */
  sousManagerName: string | null
  modelName: string
  byShift: Record<CrmShift, OrgChatter[]>
  /** Chatters du modèle sans shift (non liés ou shift vide). */
  sansShift: OrgChatter[]
  total: number
}

/** Une section = un manager et ses lignes (sous-managers × modèles). */
export interface OrgSection {
  managerName: string
  rows: OrgRow[]
  total: number
}

export interface OrganisationData {
  sections: OrgSection[]
  /** Modèles actifs qu'aucune section ne couvre (trous d'assignation, à corriger dans Membres). */
  orphanModels: string[]
  /** Effectifs réels (membres par rôle). */
  counts: { managers: number; sousManagers: number; modeles: number; chatteurs: number }
}
