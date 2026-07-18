'use server'

// Server Actions des comptes rendus journaliers. On ne rédige/supprime QUE le jour courant
// (todayParis, côté serveur) → un jour passé est FIGÉ (consultation seule), impossible à
// modifier/supprimer via l'action. Écriture = LE SIEN (RLS daily_reports, 0053/0064) ; garde
// applicative pageGuard('dashboard') = admin OU droit de page (chatteurs accordés compris).
// Le superadmin n'écrit pas (form non rendu).

import { revalidatePath } from 'next/cache'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, pageGuard, type ActionResult } from '@/lib/actions'
import { upsertReportInput } from './schema'

/** Crée ou met à jour SON compte rendu DU JOUR (upsert sur (profile_id, day=aujourd'hui)). */
export async function upsertReport(input: unknown): Promise<ActionResult> {
  return runAction({
    schema: upsertReportInput,
    input,
    guard: pageGuard('dashboard'),
    handler: async ({ content }) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      // day = jour courant serveur : les jours passés ne passent jamais par ici.
      const { error } = await supabaseUpsert(profile.id, todayParis(), content)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/dashboard')
    },
  })
}

async function supabaseUpsert(profileId: string, day: string, content: string) {
  const supabase = await createClient()
  return supabase
    .from('daily_reports')
    .upsert({ profile_id: profileId, day, content, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,day' })
}
