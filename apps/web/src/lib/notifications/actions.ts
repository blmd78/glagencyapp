'use server'

import { z } from 'zod'
import { getProfile } from '@/lib/auth'
import { noGuard, runAction, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { createClient } from '@/lib/supabase/server'

const markSeenInput = z.object({ seenUpTo: z.iso.datetime({ offset: true }) })

/**
 * La cloche vient d'être ouverte : ses nouveautés sont vues **jusqu'au `at` du plus récent item
 * AFFICHÉ** (`seenUpTo`, envoyé par le client) — jamais `now()` : un événement publié une seconde
 * après l'ouverture ne doit pas être marqué vu alors qu'il n'a jamais été montré.
 * Clampé à `now` (un horodatage client jamais dans le futur) et **ne recule jamais** : plusieurs
 * onglets peuvent appeler ceci dans le désordre, seul le plus grand `seen_at` doit rester écrit.
 * En « en tant que », on n'écrit RIEN : c'est l'admin qui regarde, pas la personne consultée — sa
 * pastille doit rester allumée. Client utilisateur : la RLS n'autorise que SA propre ligne.
 */
export async function markNotificationsSeen(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: markSeenInput,
    input: raw,
    guard: noGuard,
    handler: async ({ seenUpTo }) => {
      const profile = await getProfile()
      if (!profile || (await readStateCookie())) return
      // Comparaison en EPOCH, jamais en chaîne : PostgREST rend `seen_at` avec offset
      // `+00:00` et une précision microseconde (`...123456+00:00`), différente du `Z`
      // millisecondes de `toISOString()` — une comparaison de chaînes serait incorrecte.
      const clampedMs = Math.min(new Date(seenUpTo).getTime(), Date.now())
      const supabase = await createClient()
      const { data: existing, error: readError } = await supabase
        .from('agency_notification_seen')
        .select('seen_at')
        .eq('profile_id', profile.id)
        .maybeSingle()
      if (readError) throw new Error(readError.message)
      if (existing && new Date(existing.seen_at).getTime() >= clampedMs) return
      const { error } = await supabase
        .from('agency_notification_seen')
        .upsert({ profile_id: profile.id, seen_at: new Date(clampedMs).toISOString() })
      if (error) throw new Error(error.message)
    },
  })
}
