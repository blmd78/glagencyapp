// Briques communes aux Server Actions admin du recrutement (`actions.ts`, `actions-config.ts`) —
// module SANS 'use server' : un fichier 'use server' ne peut exporter que des fonctions async, et
// rien d'ici n'est appelable depuis le client.

import { revalidatePath } from 'next/cache'
import { BusinessError, requireAdminProfile } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'

const IMPERSONATION_MSG = 'Action indisponible en consultation (mode « en tant que »)'

/**
 * Garde de TOUTES les écritures du recrutement : admin, et jamais en « en tant que » (une
 * consultation d'admin sous l'identité d'un autre reste en lecture seule — même règle que
 * Membres, Catalogue et la Roue).
 */
export async function requireRecruitAdmin() {
  const admin = await requireAdminProfile()
  if (await readStateCookie()) throw new BusinessError(IMPERSONATION_MSG)
  return admin
}

/**
 * UN SEUL appel : le mode `'layout'` invalide toute la chaîne de layouts du sous-arbre
 * `/formation`, ce qui couvre déjà `/formation/recrutement` et `/formation/recrutement/config`
 * (un `revalidatePath('/formation/recrutement')` en plus serait redondant). Il faut ce mode et pas
 * le chemin seul : sans lui, la pastille « dossiers nouveaux » de la sidebar (rendue par
 * `app/(dash)/layout.tsx`) resterait figée après une validation.
 */
export const revalidateRecruit = () => {
  revalidatePath('/formation', 'layout')
}
