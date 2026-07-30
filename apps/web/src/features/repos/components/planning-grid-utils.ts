// Tokens / couleurs partagés par le split de `planning-grid.tsx` (docs/guidelines-standard-
// feature.md §1, fichier > 300 lignes) — util pur, hors composant (modèle `download-ranking.ts`).

import type { ReposCell } from '../types'

/** Tokens d'un texte libre (séparés par virgules), vides filtrés. */
export const tokensOf = (s: string) =>
  s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)

/** Clé de comparaison de nom libre (casse/accents/espaces tolérés). */
export const normName = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')

export const EMPTY_CELL: ReposCell = { chatterIds: [], names: '' }

// Couleurs des chips (repos posé / sur-repos / modèle).
export const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
export const CHIP_RED = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
export const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
export const CHIP_BLUE = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
export const CHIP_ORANGE = 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'

/** Code couleur par colonne (décision Benoit 2026-07-29, aligné sur l'onglet Organisation) :
 *  chatters en BLEU, managers/sous-managers en VERT, policiers en ORANGE — le rouge reste
 *  l'alerte « > 2 repos/semaine », le violet les modèles. */
export const chipForCol = (colKey: string) =>
  colKey === 'policiers' ? CHIP_ORANGE : colKey === 'managers' || colKey === 'sous-managers' ? CHIP_GREEN : CHIP_BLUE

/** Chip résolu d'une cellule : chatteur (id) ou texte libre (token), avec drapeau sur-repos. */
export interface CellChip {
  key: string
  label: string
  over: boolean
  id?: string
  token?: string
  /** Nouvel arrivant (0101) — ABSENTS sur une puce de texte libre : un token legacy n'a aucun
   *  membre derrière lui. */
  isNew?: boolean
  arrivedAt?: string | null
}
