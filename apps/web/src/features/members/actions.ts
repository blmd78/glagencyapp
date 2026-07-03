'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { requireAdmin } from '@/lib/auth'
import { PAGE_CHOICES } from '@/config/workspaces'

/**
 * Mutations de la page Membres. Toutes : zod → garde admin → client SERVICE-ROLE
 * (auth.admin.* exige la clé secrète ; les écritures profiles/profile_creators l'utilisent
 * aussi — la garde requireAdmin() est le contrôle d'accès, la RLS reste la ceinture pour
 * tout ce qui passe par le client session).
 */

const SLUGS = PAGE_CHOICES.map((p) => p.slug)

const memberInput = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(60),
  pages: z.array(z.string()).max(SLUGS.length).refine((xs) => xs.every((x) => SLUGS.includes(x)), {
    message: 'Page inconnue',
  }),
  creatorIds: z.array(z.string().uuid()).max(50),
})

type Result = { success: true } | { success: false; error: string }

/** Crée le compte auth (email confirmé → OTP direct), le profil `user`, pages + modèles. */
export async function createMember(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { email, displayName, pages, creatorIds } = parsed.data

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

  // Le trigger 0002/0008 a posé le profil : on écrit display_name/pages (idempotent).
  const { error: pErr } = await admin
    .from('profiles')
    .update({ display_name: displayName, pages, role: 'user' })
    .eq('id', uid)
  if (pErr) return { success: false, error: pErr.message }
  if (creatorIds.length) {
    const { error: cErr } = await admin
      .from('profile_creators')
      .insert(creatorIds.map((creator_id) => ({ profile_id: uid, creator_id })))
    if (cErr) return { success: false, error: cErr.message }
  }
  revalidatePath('/chatter/members')
  return { success: true }
}

const updateInput = memberInput.omit({ email: true }).extend({ id: z.string().uuid() })

export async function updateMember(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = updateInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { id, displayName, pages, creatorIds } = parsed.data

  const admin = createAdminClient()
  // Un admin n'est pas éditable depuis l'UI (rôle piloté par l'allowlist du trigger).
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single()
  if (!target) return { success: false, error: 'Profil introuvable' }
  if (target.role === 'admin') return { success: false, error: 'Un admin ne se modifie pas ici' }

  const { error: pErr } = await admin
    .from('profiles')
    .update({ display_name: displayName, pages })
    .eq('id', id)
  if (pErr) return { success: false, error: pErr.message }
  const { error: dErr } = await admin.from('profile_creators').delete().eq('profile_id', id)
  if (dErr) return { success: false, error: dErr.message }
  if (creatorIds.length) {
    const { error: cErr } = await admin
      .from('profile_creators')
      .insert(creatorIds.map((creator_id) => ({ profile_id: id, creator_id })))
    if (cErr) return { success: false, error: cErr.message }
  }
  revalidatePath('/chatter/members')
  return { success: true }
}

export async function deleteMember(id: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { success: false, error: 'Id invalide' }

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('role').eq('id', parsed.data).single()
  if (target?.role === 'admin') return { success: false, error: 'Un admin ne se supprime pas ici' }
  // Supprime le compte auth → profiles/profile_creators suivent par cascade FK.
  const { error } = await admin.auth.admin.deleteUser(parsed.data)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/members')
  return { success: true }
}
