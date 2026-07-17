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

/** Chip résolu d'une cellule : chatteur (id) ou texte libre (token), avec drapeau sur-repos. */
export interface CellChip {
  key: string
  label: string
  over: boolean
  id?: string
  token?: string
}
