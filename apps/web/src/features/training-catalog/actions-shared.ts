// Helpers partagés par actions.ts / actions-cases.ts — module SANS 'use server' : un fichier
// 'use server' ne peut exporter que des fonctions async ; ces helpers ne sont jamais appelés
// depuis le client.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdminProfile, BusinessError } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'

export type Db = Awaited<ReturnType<typeof createClient>>

export const revalidateCatalog = () => {
  revalidatePath('/formation/catalogue')
  // Les pages Modules (liste + [code]) lisent les mêmes tables : 'layout' couvre tout le segment.
  revalidatePath('/formation/modules', 'layout')
}

/** Admin + pas en « en tant que » — une seule requête profil. */
export async function requireCatalogAdmin() {
  const admin = await requireAdminProfile()
  if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
  return admin
}

export const stampBy = (adminId: string) => ({ updated_at: new Date().toISOString(), updated_by: adminId })
