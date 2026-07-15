'use server'

// Server Actions des scripts de chat — écriture ADMIN uniquement (garde en retour
// d'erreur, pas de redirect), lecture cloisonnée par le RLS (migration 0036).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { itemInput } from './schema'

type Result = { success: true } | { success: false; error: string }

async function requireAdminSafe() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return null
  return profile
}

/** Crée (id null → en fin de script) ou modifie un item du script d'un modèle. */
export async function saveScriptItem(raw: unknown): Promise<Result> {
  const admin = await requireAdminSafe()
  if (!admin) return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = itemInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()

  const row = {
    kind: d.kind,
    label: d.label,
    body: d.body,
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  }
  if (d.id) {
    // .eq creator_id : un couple (creatorId, id d'item d'un AUTRE modèle) incohérent
    // ne re-parente/écrase rien — 0 ligne touchée → « Item introuvable ».
    const { data, error } = await supabase
      .from('script_items')
      .update(row)
      .eq('id', d.id)
      .eq('creator_id', d.creatorId)
      .select('id')
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: 'Item introuvable' }
  } else {
    const { data: last } = await supabase
      .from('script_items')
      .select('position')
      .eq('creator_id', d.creatorId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase
      .from('script_items')
      .insert({ ...row, creator_id: d.creatorId, position: (last?.position ?? 0) + 10 })
    if (error) return { success: false, error: error.message }
  }
  revalidatePath('/chatter/scripts')
  return { success: true }
}

/** Supprime un item du script. */
export async function deleteScriptItem(raw: unknown): Promise<Result> {
  const admin = await requireAdminSafe()
  if (!admin) return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = z.uuid().safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('script_items').delete().eq('id', parsed.data)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/scripts')
  return { success: true }
}

/** Déplace un item d'un cran (échange les positions avec son voisin). */
export async function moveScriptItem(raw: unknown): Promise<Result> {
  const admin = await requireAdminSafe()
  if (!admin) return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) }).safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { id, direction } = parsed.data
  const supabase = await createClient()

  const { data: cur } = await supabase
    .from('script_items')
    .select('id, creator_id, position')
    .eq('id', id)
    .maybeSingle()
  if (!cur) return { success: false, error: 'Item introuvable' }

  // Voisin immédiat dans le sens demandé (positions espacées mais pas forcément régulières).
  const { data: neighbor } = await supabase
    .from('script_items')
    .select('id, position')
    .eq('creator_id', cur.creator_id)
    .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
    .order('position', { ascending: direction === 'down' })
    .limit(1)
    .maybeSingle()
  if (!neighbor) return { success: false, error: 'Déjà en bout de script' }

  // Échange des positions (2 updates — un échec au milieu laisse au pire un doublon de
  // position sans perte de données, corrigé au prochain déplacement).
  const { error: e1 } = await supabase
    .from('script_items')
    .update({ position: neighbor.position, updated_at: new Date().toISOString(), updated_by: admin.id })
    .eq('id', cur.id)
  if (e1) return { success: false, error: e1.message }
  const { error: e2 } = await supabase
    .from('script_items')
    .update({ position: cur.position, updated_at: new Date().toISOString(), updated_by: admin.id })
    .eq('id', neighbor.id)
  if (e2) return { success: false, error: e2.message }

  revalidatePath('/chatter/scripts')
  return { success: true }
}
