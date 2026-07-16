'use server'

// Server Actions du planning journalier — écriture ADMIN uniquement (garde en retour
// d'erreur, pas de redirect), lecture cloisonnée par le RLS (migration 0036).

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'
import { blockInput, metaInput } from './schema'

/**
 * Garde d'écriture : admin requis, ET le planning d'un ADMIN (ou superadmin) n'est
 * modifiable que par un superadmin — les admins le consultent seulement.
 * `cache()` : mémoïsé PAR REQUÊTE (même recette que `getChatterScope`, lib/scope.ts,
 * commit c0de767) — un guard ET un handler qui l'appellent avec le même `targetProfileId`
 * ne coûtent qu'une query de vérif du rôle cible, pas deux.
 */
const requireCanEdit = cache(
  async (
    targetProfileId: string,
  ): Promise<{ profile: NonNullable<Awaited<ReturnType<typeof getProfile>>> } | { error: string }> => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') return { error: 'Accès réservé à l’admin' }
    if (!profile.superadmin) {
      const supabase = await createClient()
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', targetProfileId)
        .single()
      if (data && (data.role === 'admin' || data.role === 'superadmin')) {
        return { error: 'Le planning d’un admin est géré par un superadmin' }
      }
    }
    return { profile }
  },
)

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
export async function saveBlock(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: blockInput,
    input: raw,
    guard: async () => {
      // Vérif de garde AVANT le handler (guard capture `raw`, safeParse défensif — pattern
      // insights/actions.ts `setInsightState`) : si invalide, laissé au safeParse de runAction.
      const parsed = blockInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const d = parsed.data
      const guard = await requireCanEdit(d.profileId)
      if ('error' in guard) return { ok: false, error: guard.error }
      // Pré-vérif d'existence (édition uniquement, même pattern SELECT que deleteBlock) :
      // un bloc d'un AUTRE membre ou déjà supprimé est un cas MÉTIER atteignable en usage
      // normal (2 admins sur le même bloc), pas juste une race technique — porte donc ici
      // le message précis. Le 0-row résiduel de l'UPDATE (course ultra-serrée post-garde)
      // reste un throw générique dans le handler.
      if (d.id) {
        const supabase = await createClient()
        const { data: blk } = await supabase
          .from('planning_blocks')
          .select('planning_id')
          .eq('id', d.id)
          .single()
        if (!blk) return { ok: false, error: 'Bloc introuvable' }
        const { data: pl } = await supabase
          .from('plannings')
          .select('id')
          .eq('profile_id', d.profileId)
          .single()
        if (!pl || pl.id !== blk.planning_id) return { ok: false, error: 'Bloc introuvable' }
      }
      return { ok: true }
    },
    handler: async (d) => {
      // requireCanEdit est mémoïsé (`cache()`) : même coût qu'un seul appel, pas de
      // round-trip DB supplémentaire pour la re-vérif du rôle cible faite dans le guard.
      const guard = await requireCanEdit(d.profileId)
      if ('error' in guard) throw new Error(guard.error) // impossible si le guard a laissé passer
      const admin = guard.profile
      const supabase = await createClient()

      const planning = await ensurePlanning(supabase, d.profileId, admin.id)
      if ('error' in planning) throw new Error(planning.error)

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
        // ne re-parente/écrase rien. Le cas métier (bloc introuvable/d'un autre membre) est
        // déjà rejeté par le guard — un 0-row ICI n'est qu'une race ultra-serrée résiduelle
        // (bloc supprimé entre le guard et cet update) → jeté (technique, message générique).
        const { data, error } = await supabase
          .from('planning_blocks')
          .update(row)
          .eq('id', d.id)
          .eq('planning_id', planning.id)
          .select('id')
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('Bloc introuvable')
      } else {
        // position = fin de section (le tri d'affichage est de toute façon par heure).
        const { count } = await supabase
          .from('planning_blocks')
          .select('id', { count: 'exact', head: true })
          .eq('planning_id', planning.id)
        const { error } = await supabase
          .from('planning_blocks')
          .insert({ ...row, position: count ?? 0 })
        if (error) throw new Error(error.message)
      }
      await supabase
        .from('plannings')
        .update({ updated_at: new Date().toISOString(), updated_by: admin.id })
        .eq('id', planning.id)
      revalidatePath('/chatter/planning')
    },
  })
}

/** Supprime un bloc horaire. */
export async function deleteBlock(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(),
    input: raw,
    guard: async () => {
      const parsed = z.uuid().safeParse(raw)
      if (!parsed.success) return { ok: true }
      const supabase = await createClient()
      // Résout le propriétaire du planning AVANT la garde : le planning d'un admin n'est
      // modifiable (bloc par bloc compris) que par un superadmin.
      const { data: blk } = await supabase
        .from('planning_blocks')
        .select('planning_id')
        .eq('id', parsed.data)
        .single()
      if (!blk) return { ok: false, error: 'Bloc introuvable' }
      const { data: pl } = await supabase
        .from('plannings')
        .select('profile_id')
        .eq('id', blk.planning_id)
        .single()
      if (!pl) return { ok: false, error: 'Planning introuvable' }
      const guard = await requireCanEdit(pl.profile_id)
      return 'error' in guard ? { ok: false, error: guard.error } : { ok: true }
    },
    handler: async (id) => {
      const supabase = await createClient()
      const { error } = await supabase.from('planning_blocks').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/planning')
    },
  })
}

/** Enregistre l'encart priorité, la note de pause et les tâches annexes. */
export async function savePlanningMeta(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: metaInput,
    input: raw,
    guard: async () => {
      const parsed = metaInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const guard = await requireCanEdit(parsed.data.profileId)
      return 'error' in guard ? { ok: false, error: guard.error } : { ok: true }
    },
    handler: async (d) => {
      const guard = await requireCanEdit(d.profileId)
      if ('error' in guard) throw new Error(guard.error) // impossible si le guard a laissé passer
      const admin = guard.profile
      const supabase = await createClient()

      const planning = await ensurePlanning(supabase, d.profileId, admin.id)
      if ('error' in planning) throw new Error(planning.error)

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
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/planning')
    },
  })
}
