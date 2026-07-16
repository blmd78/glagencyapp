'use server'

// Server Actions du planning des repos — supabase-js + RLS (page `repos` requise,
// cf. migration 0016 : has_page('repos') en lecture ET écriture).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getChatterScope } from '@/lib/scope'

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
  chatterIds: z.array(z.string().uuid()).max(200),
  names: z.string().max(1000),
})

export async function saveReposCell(raw: unknown): Promise<Result> {
  const profile = await requireRepos()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = cellInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { weekStart, day, col } = parsed.data
  let { chatterIds, names } = parsed.data

  const supabase = await createClient()

  // Non-admin : sa vue est cloisonnée à ses chatteurs (cf. get-repos) → MERGE non destructif.
  // On rejette tout id soumis hors scope, on préserve les ids hors scope existants et le texte
  // legacy (invisible pour lui) — sinon il écraserait des repos qu'il ne voit pas.
  const scope = await getChatterScope(profile)
  if (scope.chatterIds !== null) {
    if (chatterIds.some((id) => !scope.chatterIds!.has(id)))
      return { success: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }
    const { data: existing } = await supabase
      .from('rest_planning_cells')
      .select('chatter_ids, names')
      .eq('week_start', weekStart)
      .eq('day', day)
      .eq('col', col)
      .maybeSingle()
    const hidden = (existing?.chatter_ids ?? []).filter((id) => !scope.chatterIds!.has(id))
    chatterIds = [...hidden, ...chatterIds]
    names = existing?.names ?? ''
  }

  const { error } = await supabase.from('rest_planning_cells').upsert(
    {
      week_start: weekStart,
      day,
      col,
      chatter_ids: chatterIds,
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

// Édition de la compo (MODÈLES) d'une colonne — réservée admin (garde back + policy RLS is_admin).
const colMembersInput = z.object({
  col: z.enum(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']), // colonnes modèles uniquement
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  creatorIds: z.array(z.string().uuid()).max(50),
})

export async function saveReposColumnMembers(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Accès refusé' }
  const parsed = colMembersInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { col, effectiveFrom, creatorIds } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('rest_planning_column_members').upsert(
    {
      col,
      effective_from: effectiveFrom,
      creator_ids: creatorIds,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: 'col,effective_from' },
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
