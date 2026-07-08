'use server'

// Server Actions du pôle marketing — requireAdmin + zod, écritures via supabase-js
// (RLS : has_page('marketing'), un admin passe toujours).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, requireAdmin } from '@/lib/auth'
import { isMarketingSlug } from '@/config/workspaces'

type Result = { success: true } | { success: false; error: string }

const staffInput = z.object({
  id: z.uuid().nullable(), // null = création
  name: z.string().min(1).max(80),
  role: z.enum(['va', 'manager']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fixedEur: z.number().min(0).max(100000),
  rateTw: z.number().min(0).max(1000),
  rateIg: z.number().min(0).max(1000),
  bonusEur: z.number().min(0).max(100000),
  pct: z.number().min(0).max(100),
  paymentMethod: z.string().min(1).max(40),
  active: z.boolean(),
})

export async function saveStaff(raw: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = staffInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()
  const row = {
    name: d.name,
    role: d.role,
    color: d.color,
    fixed_eur: d.fixedEur,
    rate_tw: d.rateTw,
    rate_ig: d.rateIg,
    bonus_eur: d.bonusEur,
    pct: d.pct,
    payment_method: d.paymentMethod,
    active: d.active,
  }
  const { error } = d.id
    ? await supabase.from('mkt_staff').update(row).eq('id', d.id)
    : await supabase.from('mkt_staff').insert(row)
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/compta')
  return { success: true }
}

const assignInput = z.object({
  staffId: z.uuid(),
  linkIds: z.array(z.uuid()).max(500),
  igAccountIds: z.array(z.uuid()).max(500),
})

/** Remplace les assignations d'un VA (liens MyPuls + comptes Instagram). */
export async function saveStaffAssignments(raw: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = assignInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { staffId, linkIds, igAccountIds } = parsed.data
  const supabase = await createClient()

  const { error: delErr } = await supabase.from('mkt_staff_links').delete().eq('staff_id', staffId)
  if (delErr) return { success: false, error: delErr.message }
  if (linkIds.length) {
    const { error } = await supabase
      .from('mkt_staff_links')
      .insert(linkIds.map((link_id) => ({ staff_id: staffId, link_id })))
    if (error) return { success: false, error: error.message }
  }

  // Comptes IG : staff_id posé sur les comptes choisis, retiré des autres comptes de ce VA.
  const { error: clearErr } = await supabase
    .from('mkt_social_accounts')
    .update({ staff_id: null })
    .eq('staff_id', staffId)
  if (clearErr) return { success: false, error: clearErr.message }
  if (igAccountIds.length) {
    const { error } = await supabase
      .from('mkt_social_accounts')
      .update({ staff_id: staffId })
      .in('id', igAccountIds)
    if (error) return { success: false, error: error.message }
  }
  revalidatePath('/marketing/compta')
  return { success: true }
}

const paymentInput = z.object({
  staffId: z.uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  amountEur: z.number().positive().max(100000),
  method: z.string().min(1).max(40),
  note: z.string().max(300),
})

/** Enregistre un paiement de paye staff (rattaché à un mois). */
export async function recordStaffPayment(raw: unknown): Promise<Result> {
  const profile = await requireAdmin()
  const parsed = paymentInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('mkt_staff_payments').insert({
    staff_id: d.staffId,
    month: d.month,
    amount_eur: d.amountEur,
    method: d.method,
    note: d.note,
    created_by: profile.id,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/compta')
  return { success: true }
}

/** Garde d'action de saisie : admin, ou n'importe quel droit du pôle marketing. */
async function requireMkt() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.some(isMarketingSlug)) return null
  return profile
}

const socialEntryInput = z.object({
  platform: z.enum(['instagram', 'twitter']),
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
  platform: z.enum(['instagram', 'twitter']),
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

const linkTypeInput = z.object({
  linkId: z.uuid(),
  type: z.enum(['twitter', 'instagram', 'telegram', 'other']),
})

/** Correction manuelle du type d'un lien (équivalent des link_type_overrides legacy). */
export async function setLinkType(raw: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = linkTypeInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('mkt_links')
    .update({ type: parsed.data.type })
    .eq('id', parsed.data.linkId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/liens')
  return { success: true }
}
