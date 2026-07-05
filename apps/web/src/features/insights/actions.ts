'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAccess } from '@/lib/auth'

/** Changement de statut / note d'une carte. Client SESSION : la RLS (admin-only) est la garde réelle. */

const input = z.object({
  key: z.string().min(1).max(200),
  status: z.enum(['new', 'in_progress', 'resolved', 'ignored']),
  note: z.string().max(2000).nullish(),
})

type Result = { success: true } | { success: false; error: string }

export async function setInsightState(raw: unknown): Promise<Result> {
  const profile = await requireAccess('insights')
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { key, status, note } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('insight_states').upsert(
    {
      insight_key: key,
      status,
      note: note ?? null,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: 'insight_key' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/insights')
  return { success: true }
}
