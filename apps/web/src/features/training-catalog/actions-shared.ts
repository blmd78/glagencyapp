// Helpers partagés par actions.ts / actions-cases.ts — module SANS 'use server' : un fichier
// 'use server' ne peut exporter que des fonctions async ; ces helpers ne sont jamais appelés
// depuis le client.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Db = Awaited<ReturnType<typeof createClient>>

export const revalidateCatalog = () => {
  revalidatePath('/formation/catalogue')
  // Les pages Modules (liste + [code]) lisent les mêmes tables : 'layout' couvre tout le segment.
  revalidatePath('/formation/modules', 'layout')
}

export const stampBy = (adminId: string) => ({ updated_at: new Date().toISOString(), updated_by: adminId })
