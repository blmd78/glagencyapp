'use server'

// Server Actions du tracker « Police » — supabase-js + RLS.
// Saisie/modif : page `police` requise. Suppression : admin uniquement.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, type Profile } from '@/lib/auth'
import { getChatterScope } from '@/lib/scope'
import { warningInput, malusInput, updateMalusInput } from './schema'

type Result = { success: true } | { success: false; error: string }

/** Garde : admin, ou page `police` accordée (les policiers saisissent). */
async function requirePolice() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('police')) return null
  return profile
}

/** Garde périmètre : un non-admin ne peut agir que sur les chatteurs de SES modèles. */
async function chatterInScope(profile: Profile, chatterId: string): Promise<boolean> {
  const scope = await getChatterScope(profile)
  return scope.chatterIds === null || scope.chatterIds.has(chatterId)
}

export async function addPoliceWarning(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = warningInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }
  if (!(await chatterInScope(profile, p.data.chatterId)))
    return { success: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }

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
  if (!(await chatterInScope(profile, p.data.chatterId)))
    return { success: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }

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
  // Garde périmètre : un non-admin ne peut pas éditer le malus d'une autre équipe par id.
  if (profile.role !== 'admin') {
    const { data: entry } = await supabase
      .from('police_entries')
      .select('chatter_id')
      .eq('id', p.data.id)
      .maybeSingle()
    if (!entry || !(await chatterInScope(profile, entry.chatter_id)))
      return { success: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }
  }
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
