'use server'

// Server Actions des comptes rendus journaliers. Écriture = LE SIEN uniquement (RLS
// daily_reports, 0053/0064) ; garde applicative `pageGuard('dashboard')` = admin OU droit de
// page (chatteurs accordés compris — auto-rapport). Le superadmin n'écrit pas (form non rendu).

import { revalidatePath } from 'next/cache'
import { addDays, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, pageGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { REPORT_WINDOW_DAYS } from './types'
import { upsertReportInput, deleteReportInput } from './schema'

/** Crée ou met à jour SON compte rendu du jour choisi (upsert sur (profile_id, day)). */
export async function upsertReport(input: unknown): Promise<ActionResult> {
  return runAction({
    schema: upsertReportInput,
    input,
    guard: pageGuard('dashboard'),
    handler: async ({ day, content }) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      // Borne serveur : [J−30, J] Europe/Paris — jamais le futur, ni au-delà de la fenêtre.
      const today = todayParis()
      if (day > today || day < addDays(today, -REPORT_WINDOW_DAYS)) {
        throw new BusinessError('Date hors de la fenêtre autorisée (30 derniers jours).')
      }
      const supabase = await createClient()
      const { error } = await supabase.from('daily_reports').upsert(
        { profile_id: profile.id, day, content, updated_at: new Date().toISOString() },
        { onConflict: 'profile_id,day' },
      )
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/dashboard')
    },
  })
}

/** Supprime SON compte rendu (la RLS garantit « le sien uniquement »). */
export async function deleteReport(id: string): Promise<ActionResult> {
  return runAction({
    schema: deleteReportInput,
    input: { id },
    guard: pageGuard('dashboard'),
    handler: async ({ id }) => {
      const supabase = await createClient()
      const { error } = await supabase.from('daily_reports').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/dashboard')
    },
  })
}
