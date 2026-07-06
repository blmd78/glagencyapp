'use server'

// Server Actions du planning des repos — supabase-js + RLS (page `repos` requise,
// cf. migration 0017 : has_page('repos') en lecture ET écriture).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'

type Result = { success: true } | { success: false; error: string }

/** Garde d'action : admin, ou page `repos` accordée (les sous-managers gèrent le planning). */
async function requireRepos() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('repos')) return null
  return profile
}

const cellInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(0).max(6),
  col: z.string().min(1).max(30),
  names: z.string().max(1000),
})

export async function saveReposCell(raw: unknown): Promise<Result> {
  const profile = await requireRepos()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = cellInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { weekStart, day, col, names } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('rest_planning_cells').upsert(
    {
      week_start: weekStart,
      day,
      col,
      names: names.trim(),
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: 'week_start,day,col' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/repos')
  return { success: true }
}

const sentInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sent: z.boolean(),
})

export async function setReposSent(raw: unknown): Promise<Result> {
  const profile = await requireRepos()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = sentInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase.from('rest_planning_weeks').upsert(
    {
      week_start: parsed.data.weekStart,
      sent_telegram: parsed.data.sent,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: 'week_start' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/repos')
  return { success: true }
}
