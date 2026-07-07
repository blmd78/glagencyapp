'use server'

// Server Actions du tracker « Police » — supabase-js + RLS.
// Saisie/modif : page `police` requise. Suppression : admin uniquement.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { warningInput, malusInput, updateMalusInput } from './schema'

type Result = { success: true } | { success: false; error: string }

/** Garde : admin, ou page `police` accordée (les policiers saisissent). */
async function requirePolice() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('police')) return null
  return profile
}

export async function addPoliceWarning(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = warningInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').insert({
    chatter_id: p.data.chatterId,
    controller_id: profile.id,
    occurred_on: p.data.day,
    kind: 'warning',
    error_key: p.data.errorKey,
    amount_eur: 0,
    shift: p.data.shift ?? null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}

export async function addPoliceMalus(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = malusInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').insert({
    chatter_id: p.data.chatterId,
    controller_id: profile.id,
    occurred_on: p.data.day,
    kind: 'malus',
    error_key: p.data.errorKey ?? null,
    amount_eur: p.data.amountEur,
    note: p.data.note ?? null,
    shift: p.data.shift ?? null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}

export async function updatePoliceMalus(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = updateMalusInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('police_entries')
    .update({ amount_eur: p.data.amountEur, note: p.data.note ?? null })
    .eq('id', p.data.id)
    .eq('kind', 'malus')
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}

export async function deletePoliceEntry(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Accès refusé' }
  const p = z.object({ id: z.string().uuid() }).safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').delete().eq('id', p.data.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}
