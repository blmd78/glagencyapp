'use server'

// Server Actions du planning journalier — écriture ADMIN uniquement (garde en retour
// d'erreur, pas de redirect), lecture cloisonnée par le RLS (migration 0030).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { blockInput, metaInput } from './schema'

type Result = { success: true } | { success: false; error: string }

async function requireAdminSafe() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return null
  return profile
}

/**
 * Renvoie l'id du planning du membre, créé à la volée s'il n'existe pas encore.
 * Upsert (profile_id UNIQUE) : deux admins qui créent en même temps ne provoquent
 * pas d'erreur 23505 brute — le second récupère la ligne existante.
 */
async function ensurePlanning(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  adminId: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('plannings')
    .upsert({ profile_id: profileId, updated_by: adminId }, { onConflict: 'profile_id' })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

/** Crée ou modifie un bloc horaire du planning d'un membre. */
export async function saveBlock(raw: unknown): Promise<Result> {
  const admin = await requireAdminSafe()
  if (!admin) return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = blockInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()

  const planning = await ensurePlanning(supabase, d.profileId, admin.id)
  if ('error' in planning) return { success: false, error: planning.error }

  const row = {
    planning_id: planning.id,
    section: d.section,
    time_start: d.timeStart,
    time_end: d.timeEnd,
    title: d.title,
    badge: d.badge,
    color: d.color,
    bullets: d.bullets,
  }
  if (d.id) {
    // .eq planning_id : un couple (profileId, id de bloc d'un AUTRE membre) incohérent
    // ne re-parente/écrase rien — 0 ligne touchée → « Bloc introuvable ».
    const { data, error } = await supabase
      .from('planning_blocks')
      .update(row)
      .eq('id', d.id)
      .eq('planning_id', planning.id)
      .select('id')
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: 'Bloc introuvable' }
  } else {
    // position = fin de section (le tri d'affichage est de toute façon par heure).
    const { count } = await supabase
      .from('planning_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('planning_id', planning.id)
    const { error } = await supabase
      .from('planning_blocks')
      .insert({ ...row, position: count ?? 0 })
    if (error) return { success: false, error: error.message }
  }
  await supabase.from('plannings').update({ updated_at: new Date().toISOString(), updated_by: admin.id }).eq('id', planning.id)
  revalidatePath('/chatter/planning')
  return { success: true }
}

/** Supprime un bloc horaire. */
export async function deleteBlock(raw: unknown): Promise<Result> {
  const admin = await requireAdminSafe()
  if (!admin) return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = z.uuid().safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('planning_blocks').delete().eq('id', parsed.data)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/planning')
  return { success: true }
}

/** Enregistre l'encart priorité, la note de pause et les tâches annexes. */
export async function savePlanningMeta(raw: unknown): Promise<Result> {
  const admin = await requireAdminSafe()
  if (!admin) return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = metaInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()

  const planning = await ensurePlanning(supabase, d.profileId, admin.id)
  if ('error' in planning) return { success: false, error: planning.error }

  const { error } = await supabase
    .from('plannings')
    .update({
      priority_title: d.priorityTitle,
      priority_body: d.priorityBody,
      priority_forbidden: d.priorityForbidden,
      priority_allowed: d.priorityAllowed,
      pause_note: d.pauseNote,
      annexes: d.annexes,
      annex_note: d.annexNote,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    })
    .eq('id', planning.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/planning')
  return { success: true }
}
