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

/** « Redonner partout » : les mêmes `extra` essais sur chaque exercice bloqué du chatteur. */
export const grantLockedAttemptsInput = z.object({
  profileId: z.uuid(),
  extra,
})

export type GrantLockedAttemptsValues = z.input<typeof grantLockedAttemptsInput>
