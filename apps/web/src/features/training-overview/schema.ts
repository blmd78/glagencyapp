import { z } from 'zod'

/** Borne de la colonne `training_attempt_grants.extra` (0161) — et de la saisie, 20 au plus d'un coup. */
export const GRANT_MAX = 20

const extra = z.number('Indique un nombre').int('Nombre entier').min(1, '1 minimum').max(GRANT_MAX, `${GRANT_MAX} maximum`)

/**
 * Essais redonnés par l'encadrement sur un exercice (0161) — partagé par l'action `grantAttempts`
 * et son formulaire de la fiche chatteur.
 */
export const grantAttemptsInput = z.object({
  profileId: z.uuid(),
  caseId: z.uuid(),
  extra,
})

export type GrantAttemptsValues = z.input<typeof grantAttemptsInput>

/** Le nombre d'essais saisi — le seul champ du formulaire de la sélection. */
export const grantExtraInput = z.object({ extra })

export type GrantExtraValues = z.input<typeof grantExtraInput>

/**
 * « Redonner » sur une SÉLECTION de niveaux (interrupteurs de la fiche, « Tout le module »,
 * « Sélectionner les bloqués ») : les mêmes `extra` essais sur chacun. 500 au plus : bien au-delà
 * du catalogue, de quoi refuser un envoi forgé démesuré.
 */
export const grantSelectedAttemptsInput = grantExtraInput.extend({
  profileId: z.uuid(),
  caseIds: z.array(z.uuid()).min(1, 'Sélectionne au moins un niveau').max(500),
})
