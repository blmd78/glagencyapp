/** Contrat de l'onglet Codes Snap — identifiants Snapchat par modèle (porté de gla-workflow). */

export const SNAP_STATUTS = ['actif', 'banni', 'en pause', 'à recréer'] as const
export type SnapStatut = (typeof SNAP_STATUTS)[number]

/**
 * Sentinelle affichée à la place du mot de passe quand la clé de déchiffrement est absente
 * (`decryptSecret` → null). Elle circule comme VALEUR du champ `mdp` éditable en autosave :
 * l'action d'écriture doit la REFUSER, sinon un simple blur la chiffrerait par-dessus le
 * vrai mot de passe — perte d'un ciphertext encore récupérable avec la bonne clé.
 */
export const MDP_KEY_MISSING = '⚠ clé de déchiffrement absente'

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
