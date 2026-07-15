/** Contrat de l'onglet Codes Snap — identifiants Snapchat par modèle (porté de gla-workflow). */

export const SNAP_STATUTS = ['actif', 'banni', 'en pause', 'à recréer'] as const
export type SnapStatut = (typeof SNAP_STATUTS)[number]

export interface SnapCodeRow {
  creatorId: string
  model: string
  pseudo: string
  mdp: string
  statut: SnapStatut
  notes: string
}

export interface SnapCodesData {
  rows: SnapCodeRow[]
}
