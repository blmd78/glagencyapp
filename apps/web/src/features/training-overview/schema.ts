import { z } from 'zod'

/**
 * Essais redonnés par l'encadrement sur un exercice (0161) — partagé par l'action `grantAttempts`
 * et son formulaire de la fiche chatteur. 20 au plus d'un coup : c'est la borne de la colonne
 * `training_attempt_grants.extra`.
 */
export const grantAttemptsInput = z.object({
  profileId: z.uuid(),
  caseId: z.uuid(),
  extra: z.number('Indique un nombre').int('Nombre entier').min(1, '1 minimum').max(20, '20 maximum'),
})

export type GrantAttemptsValues = z.input<typeof grantAttemptsInput>
