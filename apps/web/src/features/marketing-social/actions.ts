'use server'

// Server Actions du pôle marketing — écritures via supabase-js (RLS : has_page('marketing'),
// un admin passe toujours). Standard runAction (docs/guidelines-standard-feature.md §4) : la
// garde d'entrée vit dans `guard` ; `handler` re-dérive le même résultat à partir des
// `values` déjà validées (mêmes messages, verbatim).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'
import { isMarketingSlug } from '@/config/workspaces'

/** Garde d'action de saisie : admin, ou n'importe quel droit du pôle marketing. */
async function requireMkt() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.some(isMarketingSlug)) return null
  return profile
}

async function mktGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await requireMkt()
  return profile ? { ok: true } : { ok: false, error: 'Accès refusé' }
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

/** Lignes réellement renseignées (vues/engagement saisis, ou followers présents). */
function touchedRows(rows: z.infer<typeof socialEntryInput>['rows']) {
  return rows.filter((r) => r.followers != null || r.views24h != null || r.engagement24h != null)
}

/**
 * Saisie du jour des comptes sociaux (remplace le rituel Discord des VA) :
 * upsert (compte, date), delta followers calculé contre le dernier relevé antérieur.
 */
export async function saveSocialEntries(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: socialEntryInput,
    input: raw,
    guard: async () => {
      const gate = await mktGuard()
      if (!gate.ok) return gate
      // Parse défensif de `raw` (capturé par fermeture) : si invalide, laissé au safeParse
      // de runAction — pattern scripts/members (docs/guidelines-standard-feature.md §4).
      const parsed = socialEntryInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      if (!touchedRows(parsed.data.rows).length) return { ok: false, error: 'Aucune valeur saisie' }
      return { ok: true }
    },
    handler: async ({ platform, date, rows }) => {
      const supabase = await createClient()

      // Dernier relevé ANTÉRIEUR à la date saisie, par compte (pour le delta followers).
      const { data: prev, error: prevErr } = await supabase
        .from('mkt_social_daily')
        .select('account_id, date, followers')
        .in('account_id', rows.map((r) => r.accountId))
        .lt('date', date)
        .order('date', { ascending: false })
      if (prevErr) throw new Error(prevErr.message)
      const prevFollowers = new Map<string, number>()
      for (const p of prev ?? []) {
        if (!prevFollowers.has(p.account_id) && p.followers != null) {
          prevFollowers.set(p.account_id, p.followers)
        }
      }

      const upserts = touchedRows(rows).map((r) => ({
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
      if (!upserts.length) throw new Error('Aucune valeur saisie') // impossible : guard déjà validé
      const { error } = await supabase
        .from('mkt_social_daily')
        .upsert(upserts, { onConflict: 'account_id,date' })
      if (error) throw new Error(error.message)
      revalidatePath(`/marketing/${platform}`)
    },
  })
}

const accountInput = z.object({
  platform: z.enum(['instagram', 'twitter', 'telegram']),
  handle: z.string().trim().min(1).max(60),
  creatorId: z.uuid().nullable(),
  staffId: z.uuid().nullable(),
})

/** Ajoute un compte social à suivre (nouveau compte de la farm). */
export async function addSocialAccount(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: accountInput,
    input: raw,
    guard: mktGuard,
    handler: async (d) => {
      const supabase = await createClient()
      const { error } = await supabase.from('mkt_social_accounts').insert({
        platform: d.platform,
        handle: d.handle.replace(/^@/, ''),
        creator_id: d.creatorId,
        staff_id: d.staffId,
      })
      if (error) throw new Error(error.message)
      revalidatePath(`/marketing/${d.platform}`)
    },
  })
}
