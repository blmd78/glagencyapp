'use server'

// Server Actions du planning journalier — écriture réservée admin/superadmin, et manager
// sur SES sous-managers directs (garde en retour d'erreur, pas de redirect) ; lecture
// cloisonnée par le RLS (migrations 0036/0043/0061).
//
// `requireCanEdit` est vérifiée UNE SEULE FOIS, en tête de chaque handler — PAS dans `guard` :
// `cache()` (React) ne mémoïse que dans le rendu d'un Server Component
// (react.dev/reference/react/cache, « cache is for use in Server Components only » — appelée
// hors composant, la fonction s'exécute mais ne lit ni n'alimente jamais le cache). Un `guard`
// qui vérifiait le droit (+ pré-vérif d'existence) puis un handler qui revérifiait le droit
// payaient donc deux fois la requête Supabase. `runAction` exige quand même un `guard` :
// `noGuard` (lib/actions) le satisfait sans rien vérifier, tout le contrôle (droit +
// existence) vit dans le handler (`BusinessError` = message métier affiché tel quel).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, type Profile } from '@/lib/auth'
import { runAction, noGuard, BusinessError, managerPageGuard, type ActionResult } from '@/lib/actions'
import { getPlanning } from './services/get-planning'
import { blockInput } from './schema'
import type { PlanningData } from './types'

/**
 * LECTURE à la demande — même dérogation assumée que `features/reports/actions.ts` : la pile de
 * noms s'affiche repliée, charger d'emblée les blocs de tout le monde gonflerait le premier
 * rendu pour du contenu que personne ne regarde. Déplier est une action CLIENT, donc il faut un
 * aller-retour.
 *
 * `managerPageGuard` et NON `pageGuard` : la page elle-même redirige les chatteurs
 * (`page.tsx`, `baseRole === 'chatteur'` → /no-access) ; la garde de l'action doit dire la même
 * chose, sinon un chatteur pourrait lire par l'action ce que l'UI lui refuse. La RLS
 * (0043/0061/0062) reste le vrai cloisonnement — cette garde n'est que le miroir applicatif.
 * Schéma inline : mono-usage, serveur uniquement, aucun resolver client à partager (§5).
 */
export async function loadPlanning(input: unknown): Promise<ActionResult<PlanningData>> {
  return runAction({
    schema: z.object({ profileId: z.uuid() }),
    input,
    guard: managerPageGuard('planning'),
    handler: ({ profileId }) => getPlanning(profileId),
  })
}

/** Rôle + rattachement de la cible (client session, RLS appliquée). Erreur TECHNIQUE thrown
 *  (Sentry via runAction) ; 0-row (PGRST116 = cible inexistante) → null (métier). */
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

/**
 * Garde d'écriture : admin (le planning d'un ADMIN/superadmin n'est modifiable que par un
 * superadmin), OU manager sur un de SES sous-managers directs (role sous-manager + manager_id
 * = lui) — miroir de la RLS `can_edit_planning_of`/`can_manage_planning_of` (0043/0061).
 */
const requireCanEdit = async (targetProfileId: string): Promise<{ profile: Profile } | { error: string }> => {
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
export async function saveBlock(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: blockInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const guard = await requireCanEdit(d.profileId)
      if ('error' in guard) throw new BusinessError(guard.error)
      const admin = guard.profile
      const supabase = await createClient()

      // Pré-vérif d'existence (édition uniquement) : un bloc d'un AUTRE membre ou déjà
      // supprimé est un cas MÉTIER atteignable en usage normal (2 admins sur le même bloc),
      // pas juste une race technique → BusinessError, message précis.
      if (d.id) {
        // Les deux SELECT sont indépendants (bloc par id, planning par profileId) → parallèles.
        // `.single()` erre AUSSI sur 0 ligne (PGRST116) : ce cas-là est MÉTIER
        // (« Bloc introuvable ») — seuls les autres échecs sont techniques (thrown).
        const [
          { data: blk, error: blkError },
          { data: pl, error: plError },
        ] = await Promise.all([
          supabase.from('planning_blocks').select('planning_id').eq('id', d.id).single(),
          supabase.from('plannings').select('id').eq('profile_id', d.profileId).single(),
        ])
        if (blkError && blkError.code !== 'PGRST116') throw new Error(blkError.message)
        if (!blk) throw new BusinessError('Bloc introuvable')
        if (plError && plError.code !== 'PGRST116') throw new Error(plError.message)
        if (!pl || pl.id !== blk.planning_id) throw new BusinessError('Bloc introuvable')
      }

      const planning = await ensurePlanning(supabase, d.profileId, admin.id)
      if ('error' in planning) throw new Error(planning.error)

      const row = {
        planning_id: planning.id,
        section: d.section,
        time_start: d.timeStart,
        time_end: d.timeEnd,
        title: d.title,
        color: d.color,
        bullets: d.bullets,
        categories: d.categories,
        days: d.days,
      }
      if (d.id) {
        // .eq planning_id : un couple (profileId, id de bloc d'un AUTRE membre) incohérent
        // ne re-parente/écrase rien. Le cas métier (bloc introuvable/d'un autre membre) vient
        // d'être écarté ci-dessus — un 0-row ICI n'est qu'une race ultra-serrée résiduelle
        // (bloc supprimé entre la pré-vérif et cet update) → jeté (technique, message générique).
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
      const { error: touchErr } = await supabase
        .from('plannings')
        .update({ updated_at: new Date().toISOString(), updated_by: admin.id })
        .eq('id', planning.id)
      if (touchErr) throw new Error(touchErr.message)
      revalidatePath('/chatter/planning')
    },
  })
}

/** Supprime un bloc horaire. */
export async function deleteBlock(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(),
    input: raw,
    guard: noGuard,
    handler: async (id) => {
      const supabase = await createClient()
      // Résout le propriétaire du planning : le planning d'un admin n'est modifiable (bloc par
      // bloc compris) que par un superadmin — cf. requireCanEdit.
      // Même nuance PGRST116 que saveBlock : 0 ligne = métier, le reste = technique.
      const { data: blk, error: blkError } = await supabase
        .from('planning_blocks')
        .select('planning_id')
        .eq('id', id)
        .single()
      if (blkError && blkError.code !== 'PGRST116') throw new Error(blkError.message)
      if (!blk) throw new BusinessError('Bloc introuvable')
      const { data: pl, error: plError } = await supabase
        .from('plannings')
        .select('profile_id')
        .eq('id', blk.planning_id)
        .single()
      if (plError && plError.code !== 'PGRST116') throw new Error(plError.message)
      if (!pl) throw new BusinessError('Planning introuvable')
      const guard = await requireCanEdit(pl.profile_id)
      if ('error' in guard) throw new BusinessError(guard.error)

      const { error } = await supabase.from('planning_blocks').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/planning')
    },
  })
}
