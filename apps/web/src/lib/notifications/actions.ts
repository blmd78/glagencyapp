'use server'

import { z } from 'zod'
import { getProfile } from '@/lib/auth'
import { noGuard, runAction, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { createClient } from '@/lib/supabase/server'

/**
 * La cloche vient d'être ouverte : ses nouveautés sont vues. En « en tant que », on n'écrit RIEN :
 * c'est l'admin qui regarde, pas la personne consultée — sa pastille doit rester allumée.
 * Client utilisateur : la RLS n'autorise que SA propre ligne.
 */
export async function markNotificationsSeen(): Promise<ActionResult> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    guard: noGuard,
    handler: async () => {
      const profile = await getProfile()
      if (!profile || (await readStateCookie())) return
      const supabase = await createClient()
      const { error } = await supabase
        .from('agency_notification_seen')
        .upsert({ profile_id: profile.id, seen_at: new Date().toISOString() })
      if (error) throw new Error(error.message)
    },
  })
}
