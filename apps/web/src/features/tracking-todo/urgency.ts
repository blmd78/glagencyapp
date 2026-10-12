/**
 * Les trois niveaux d'urgence d'une tâche (#160, décision de Benoit du 2026-10-12) — « les
 * classiques, comme sur Trello ou Notion ». Même liste que le `check` SQL de 0192 : un niveau
 * ajouté ici sans migration serait refusé par la base.
 *
 * Normale est le défaut. Les couleurs vivent dans `tracker-theme.css` (`.u-<niveau>`) : bleu,
 * orange, rouge. Le vert est écarté à dessein — dans cette to-do, il veut déjà dire « fait ».
 */
export const URGENCIES = ['normale', 'importante', 'urgente'] as const

export type Urgency = (typeof URGENCIES)[number]

export const DEFAULT_URGENCY: Urgency = 'normale'

export const URGENCY_LABEL: Record<Urgency, string> = {
  normale: 'Normale',
  importante: 'Importante',
  urgente: 'Urgente',
}

/**
 * Lit une urgence venue de la base. La colonne est un `text` sous `check` : les types générés la
 * disent `string`, on la ramène au type fermé — avec le défaut plutôt qu'une erreur si une valeur
 * inattendue passait, une couleur manquante ne doit pas faire tomber la semaine.
 */
export function asUrgency(value: string | null | undefined): Urgency {
  return (URGENCIES as readonly string[]).includes(value ?? '') ? (value as Urgency) : DEFAULT_URGENCY
}
