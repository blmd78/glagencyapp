// Couleurs sémantiques des badges de statut, light + dark — source unique de vérité.
// Recette docs shadcn (badge custom colors) : fond 50 / texte 700 en light,
// fond 950 PLEIN / texte 300 en dark, sans bordure colorée.
// Exception : neutral utilise zinc-800 en dark (zinc-950 serait invisible sur le fond de page).
export const STATUS_COLORS = {
  /** Actif, OK, sain. */
  positive: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  /** Inactif, fantôme, non concerné. */
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  /** À surveiller. */
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  /** Critique, bloquant. */
  danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  /** Information, opportunité. */
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
} as const

export type StatusColor = keyof typeof STATUS_COLORS
