'use server'

// Server Actions du planning journalier — écriture réservée admin/superadmin, et manager
// sur SES sous-managers directs (garde en retour d'erreur, pas de redirect) ; lecture
// cloisonnée par le RLS (migrations 0036/0043/0061).

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, type Profile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'
import { blockInput, metaInput } from './schema'

/**
 * Garde d'écriture : admin (le planning d'un ADMIN/superadmin n'est modifiable que par un
 * superadmin), OU manager sur un de SES sous-managers directs (role sous-manager + manager_id
 * = lui) — miroir de la RLS `can_edit_planning_of`/`can_manage_planning_of` (0043/0061).
 * `cache()` : mémoïsé PAR REQUÊTE (même recette que `getChatterScope`, lib/scope.ts,
 * commit c0de767) — un guard ET un handler qui l'appellent avec le même `targetProfileId`
 * ne coûtent qu'une query de vérif du rôle cible, pas deux.
 */
/** Rôle + rattachement de la cible (client session, RLS appliquée). Erreur TECHNIQUE thrown
 *  (§3, remontée à Sentry via runAction) ; 0-row (PGRST116 = cible inexistante) → null (métier). */
const loadTargetProfile = async (id: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role, manager_id')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

const requireCanEdit = cache(
  async (targetProfileId: string): Promise<{ profile: Profile } | { error: string }> => {
    const profile = await getProfile()
    if (!profile) return { error: 'Accès réservé' }
    // superadmin : édite tout (dont son propre planning) — aucune query cible nécessaire.
    if (profile.superadmin) return { profile }
    const target = await loadTargetProfile(targetProfileId)
    // admin : édite tout SAUF le planning d'un admin/superadmin (0043) — dont le sien.
    if (profile.role === 'admin') {
      if (target && (target.role === 'admin' || target.role === 'superadmin')) {
        return { error: 'Le planning d’un admin est géré par un superadmin' }
      }
      return { profile }
    }
    // manager : édite le planning de SES sous-managers directs (miroir RLS
    // can_manage_planning_of, 0061). Un sous-manager n'édite personne.
    if (profile.baseRole === 'manager' && target?.role === 'sous-manager' && target.manager_id === profile.id) {
      return { profile }
    }
    return { error: 'Accès réservé' }
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
        // `.single()` erre AUSSI sur 0 ligne (PGRST116) : ce cas-là est MÉTIER
        // (« Bloc introuvable ») — seuls les autres échecs sont techniques (thrown).
        const { data: blk, error: blkError } = await supabase
          .from('planning_blocks')
          .select('planning_id')
          .eq('id', d.id)
          .single()
        if (blkError && blkError.code !== 'PGRST116') throw new Error(blkError.message)
        if (!blk) return { ok: false, error: 'Bloc introuvable' }
        const { data: pl, error: plError } = await supabase
          .from('plannings')
          .select('id')
          .eq('profile_id', d.profileId)
          .single()
        if (plError && plError.code !== 'PGRST116') throw new Error(plError.message)
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
      // Même nuance PGRST116 que saveBlock : 0 ligne = métier, le reste = technique.
      const { data: blk, error: blkError } = await supabase
        .from('planning_blocks')
        .select('planning_id')
        .eq('id', parsed.data)
        .single()
      if (blkError && blkError.code !== 'PGRST116') throw new Error(blkError.message)
      if (!blk) return { ok: false, error: 'Bloc introuvable' }
      const { data: pl, error: plError } = await supabase
        .from('plannings')
        .select('profile_id')
        .eq('id', blk.planning_id)
        .single()
      if (plError && plError.code !== 'PGRST116') throw new Error(plError.message)
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
