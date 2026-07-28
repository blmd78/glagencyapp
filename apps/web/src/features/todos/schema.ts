import { z } from 'zod'

// Schémas PARTAGÉS client (RHF) ↔ serveur (runAction). `profileId` est le PORTEUR de la
// liste — la personne dont le panneau est ouvert dans la pile, ou celle isolée par le filtre
// `?membre=`, jamais le spectateur : il fait partie de l'entrée validée, la garde applicative
// et la RLS tranchent ensuite le droit d'y écrire.

const statusInvalidMsg = 'Statut invalide (à faire, en cours ou terminé attendu)'
const status = z.enum(['todo', 'in_progress', 'done'], { message: statusInvalidMsg })
const type = z.enum(['feature', 'bug', 'maintenance'])

const priorityInvalidMsg = 'Priorité invalide (1, 2 ou 3 attendus)'
// Les deux appelants envoient déjà un nombre (le dialog convertit via `Number(v)` dans son
// `onChange`, l'ajout rapide envoie le littéral `2`) : pas de coercition de chaîne nécessaire.
const priority = z.union([z.literal(1), z.literal(2), z.literal(3)], { message: priorityInvalidMsg })

/**
 * Champ texte facultatif : clé absente (undefined) OU '' → null ; une chaîne réelle est
 * trimmée puis bornée en longueur (le `.max` s'applique donc bien APRÈS le trim).
 * `.nullable()` laisse passer `null` sans repasser par le schéma string (donc pas de re-trim
 * inutile) ; `.default(null)` couvre le cas où la clé est simplement omise par l'appelant.
 */
const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null)

const base = {
  profileId: z.uuid(),
  title: z.string().trim().min(1, 'Titre requis').max(200, 'Titre trop long (200 max)'),
  description: optionalText(5000, 'Description trop longue (5 000 max)'),
  // Même logique que optionalText : clé absente → null (pas d'erreur Zod anglaise brute).
  type: type.nullable().default(null),
  priority,
  release: optionalText(20, 'Release trop longue (20 max)'),
}

// Statut à la création — TOUJOURS « À faire » (spec 2026-07-28-todos-dates) : une tâche ne
// naît jamais ailleurs, le chrono ne démarre qu'au passage explicite en « En cours »
// (`setTodoStatus`). Littéral plutôt que l'enum complet : cette contrainte a désormais une
// couche serveur, pas seulement l'absence de champ statut côté dialog/ajout rapide.
export const todoCreateInput = z.object({ ...base, status: z.literal('todo').default('todo') })
export type TodoCreateInput = z.infer<typeof todoCreateInput>

export const todoUpdateInput = z.object({ ...base, id: z.uuid() })

/** Statut en valeur ABSOLUE (jamais un déplacement relatif) : deux drags concurrents convergent. */
export const todoStatusInput = z.object({ id: z.uuid(), profileId: z.uuid(), status })

export const todoDeleteInput = z.object({ id: z.uuid(), profileId: z.uuid() })

/** Entrée de `loadTodos` — chargement du panneau d'une personne dans la pile. */
export const todoLoadInput = z.object({ profileId: z.uuid() })
