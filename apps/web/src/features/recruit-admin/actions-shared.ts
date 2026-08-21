// Brique commune aux Server Actions admin du recrutement (`actions.ts`, `actions-config.ts`) —
// module SANS 'use server' : un fichier 'use server' ne peut exporter que des fonctions async, et
// rien d'ici n'est appelable depuis le client.
//
// La GARDE des écritures (admin + refus en « en tant que ») vit dans `@/lib/actions`
// (`requireAdminProfileLive`) : elle est identique pour Membres, Catalogue, Recrutement et la Roue.

import { revalidatePath } from 'next/cache'

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
