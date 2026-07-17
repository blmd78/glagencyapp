'use server'

// Server Actions du pôle marketing — requireAdmin + zod, écritures via supabase-js
// (RLS : has_page('marketing'), un admin passe toujours).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { isMarketingSlug } from '@/config/workspaces'

type Result = { success: true } | { success: false; error: string }

/** Garde d'action de saisie : admin, ou n'importe quel droit du pôle marketing. */
async function requireMkt() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.some(isMarketingSlug)) return null
  return profile
}

const socialEntryInput = z.object({
  platform: z.enum(['instagram', 'twitter', 'telegram']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        accountId: z.uuid(),
        followers: z.number().int().min(0).nullable(),
        views24h: z.number().int().min(0).nullable(),
        engagement24h: z.number().int().min(0).nullable(),
        status: z.string().max(30).nullable(),
      }),
    )
    .min(1)
    .max(300),
})

/**
 * Saisie du jour des comptes sociaux (remplace le rituel Discord des VA) :
 * upsert (compte, date), delta followers calculé contre le dernier relevé antérieur.
 */
export async function saveSocialEntries(raw: unknown): Promise<Result> {
  const profile = await requireMkt()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = socialEntryInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { platform, date, rows } = parsed.data
  const supabase = await createClient()

  // Dernier relevé ANTÉRIEUR à la date saisie, par compte (pour le delta followers).
  const { data: prev } = await supabase
    .from('mkt_social_daily')
    .select('account_id, date, followers')
    .in('account_id', rows.map((r) => r.accountId))
    .lt('date', date)
    .order('date', { ascending: false })
  const prevFollowers = new Map<string, number>()
  for (const p of prev ?? []) {
    if (!prevFollowers.has(p.account_id) && p.followers != null) {
      prevFollowers.set(p.account_id, p.followers)
    }
  }

  const upserts = rows
    .filter((r) => r.followers != null || r.views24h != null || r.engagement24h != null)
    .map((r) => ({
      account_id: r.accountId,
      date,
      followers: r.followers,
      delta_followers:
        r.followers != null && prevFollowers.has(r.accountId)
          ? r.followers - (prevFollowers.get(r.accountId) as number)
          : null,
      views_24h: r.views24h,
      engagement_24h: r.engagement24h,
      status: r.status ?? 'ok',
    }))
  if (!upserts.length) return { success: false, error: 'Aucune valeur saisie' }
  const { error } = await supabase
    .from('mkt_social_daily')
    .upsert(upserts, { onConflict: 'account_id,date' })
  if (error) return { success: false, error: error.message }
  revalidatePath(`/marketing/${platform}`)
  return { success: true }
}

const accountInput = z.object({
  platform: z.enum(['instagram', 'twitter', 'telegram']),
  handle: z.string().trim().min(1).max(60),
  creatorId: z.uuid().nullable(),
  staffId: z.uuid().nullable(),
})

/** Ajoute un compte social à suivre (nouveau compte de la farm). */
export async function addSocialAccount(raw: unknown): Promise<Result> {
  const profile = await requireMkt()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = accountInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('mkt_social_accounts').insert({
    platform: d.platform,
    handle: d.handle.replace(/^@/, ''),
    creator_id: d.creatorId,
    staff_id: d.staffId,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath(`/marketing/${d.platform}`)
  return { success: true }
}
