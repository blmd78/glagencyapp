'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { isMarketingSlug } from '@/config/workspaces'
import { requireAdmin } from '@/lib/auth'
import { memberInput, memberUpdateInput } from './schema'

/**
 * Mutations de la page Membres. Toutes : zod → garde admin → client SERVICE-ROLE
 * (auth.admin.* exige la clé secrète). La garde requireAdmin() est le contrôle d'accès ;
 * la RLS reste la ceinture pour tout ce qui passe par le client session.
 */

type Result = { success: true } | { success: false; error: string }
type Admin = ReturnType<typeof createAdminClient>

/**
 * Fusionne les pages : le scope courant remplace SES slugs, ceux de l'autre face sont
 * préservés. Le droit de face `marketing` (utilisé par la RLS has_page) suit : posé dès
 * qu'une page mkt-* est cochée, retiré sinon.
 */
function mergePages(existing: string[], selected: string[], scope: 'chatter' | 'marketing'): string[] {
  const kept = existing.filter((s) => (scope === 'marketing' ? !isMarketingSlug(s) : isMarketingSlug(s)))
  const withFace =
    scope === 'marketing' && selected.length ? [...selected, 'marketing'] : selected
  return [...new Set([...kept, ...withFace])]
}

const revalidateMembers = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
}

/**
 * Aligne profile_creators sur `wanted` SANS fenêtre destructrice : upsert des ajouts
 * D'ABORD (idempotent), delete des retraits ENSUITE — un échec au milieu laisse au pire
 * un surplus d'accès temporaire, jamais un membre vidé (qui ne verrait plus rien via la RLS).
 */
async function syncAssignments(admin: Admin, profileId: string, wanted: string[]): Promise<string | null> {
  const { data: current, error: rErr } = await admin
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', profileId)
  if (rErr) return rErr.message
  const have = new Set((current ?? []).map((c) => c.creator_id))
  const want = new Set(wanted)

  const toAdd = wanted.filter((id) => !have.has(id))
  if (toAdd.length) {
    const { error } = await admin
      .from('profile_creators')
      .upsert(toAdd.map((creator_id) => ({ profile_id: profileId, creator_id })), {
        onConflict: 'profile_id,creator_id',
        ignoreDuplicates: true,
      })
    if (error) return error.message
  }
  const toRemove = [...have].filter((id) => !want.has(id))
  if (toRemove.length) {
    const { error } = await admin
      .from('profile_creators')
      .delete()
      .eq('profile_id', profileId)
      .in('creator_id', toRemove)
    if (error) return error.message
  }
  return null
}

/** Cible éditable = profil existant NON admin (les admins sont pilotés par l'allowlist). */
async function requireEditableTarget(admin: Admin, id: string): Promise<string | null> {
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single()
  if (!target) return 'Profil introuvable'
  if (target.role === 'admin') return 'Un admin ne se gère pas depuis cette page'
  return null
}

/** Crée le compte auth (email confirmé → OTP direct), le profil, pages + modèles. */
export async function createMember(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide (au moins une page requise)' }
  const { scope, email, displayName, role, pages, creatorIds, workLink } = parsed.data

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error || !created.user) {
    return { success: false, error: error?.message ?? 'Création refusée' }
  }
  const uid = created.user.id

  // Le trigger a posé le profil ET son rôle (allowlist → admin, sinon user) : on n'écrase
  // jamais un admin allowlisté — le rôle choisi (user/manager) n'est posé que sinon
  // (garde .neq en plus du guard applicatif).
  const { error: pErr } = await admin
    .from('profiles')
    .update({ display_name: displayName, pages: mergePages([], pages, scope), work_link: workLink })
    .eq('id', uid)
  if (pErr) return { success: false, error: pErr.message }
  if (role === 'manager') {
    const { error: rErr } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', uid)
      .neq('role', 'admin')
    if (rErr) return { success: false, error: rErr.message }
  }
  // Les modèles assignés sont un concept de la face chatteurs uniquement.
  if (scope === 'chatter') {
    const sErr = await syncAssignments(admin, uid, creatorIds)
    if (sErr) return { success: false, error: sErr }
  }
  revalidateMembers()
  return { success: true }
}

export async function updateMember(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = memberUpdateInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide (au moins une page requise)' }
  const { scope, id, displayName, role, pages, creatorIds, workLink } = parsed.data

  const admin = createAdminClient()
  const guard = await requireEditableTarget(admin, id)
  if (guard) return { success: false, error: guard }

  // requireEditableTarget garantit que la cible n'est pas admin → poser user/manager est sûr.
  const { data: current } = await admin.from('profiles').select('pages').eq('id', id).single()
  const { error: pErr } = await admin
    .from('profiles')
    .update({ display_name: displayName, role, pages: mergePages(current?.pages ?? [], pages, scope), work_link: workLink })
    .eq('id', id)
  if (pErr) return { success: false, error: pErr.message }
  if (scope === 'chatter') {
    const sErr = await syncAssignments(admin, id, creatorIds)
    if (sErr) return { success: false, error: sErr }
  }
  revalidateMembers()
  return { success: true }
}

export async function deleteMember(id: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { success: false, error: 'Id invalide' }

  const admin = createAdminClient()
  const guard = await requireEditableTarget(admin, parsed.data)
  if (guard) return { success: false, error: guard }
  // Supprime le compte auth → profiles/profile_creators suivent par cascade FK.
  const { error } = await admin.auth.admin.deleteUser(parsed.data)
  if (error) return { success: false, error: error.message }
  revalidateMembers()
  return { success: true }
}
