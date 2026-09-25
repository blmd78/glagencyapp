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
 * `seenUpTo` = `agency_events.created_at` (précision MICROSECONDE, ex. `...10:00:00.123456+00:00`)
 * : la chaîne voyage TELLE QUELLE jusqu'à Postgres, jamais reconstruite via `new Date(...)`
 * (`Date` tronque à la milliseconde — `.123456` deviendrait `.123000` < la vraie valeur, et la
 * RPC 0175 compare `v.at > seen_at` : l'événement le plus récent resterait non-lu POUR TOUJOURS,
 * aucune ouverture ultérieure ne pouvant plus le dépasser). Clampée au futur (un horodatage
 * client ne doit jamais dépasser `now`) en comparant en EPOCH, mais la valeur ÉCRITE reste soit
 * la chaîne reçue telle quelle, soit `new Date().toISOString()` — jamais un aller-retour de
 * `seenUpTo` par `Date`.
 * **Ne recule jamais** et est **atomique entre onglets** : `upsert(..., { ignoreDuplicates:
 * true })` pose la ligne si elle n'existe pas encore (sans l'écraser si un autre onglet vient de
 * la créer), puis `update().lt('seen_at', upTo)` ne fait avancer que si la valeur en base est
 * PLUS ANCIENNE — Postgres tranche à la microseconde, aucune lecture préalable côté app.
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
      const upTo = new Date(seenUpTo).getTime() > Date.now() ? new Date().toISOString() : seenUpTo
      const supabase = await createClient()
      const { error: insertError } = await supabase
        .from('agency_notification_seen')
        .upsert({ profile_id: profile.id, seen_at: upTo }, { onConflict: 'profile_id', ignoreDuplicates: true })
      if (insertError) throw new Error(insertError.message)
      const { error: advanceError } = await supabase
        .from('agency_notification_seen')
        .update({ seen_at: upTo })
        .eq('profile_id', profile.id)
        .lt('seen_at', upTo)
      if (advanceError) throw new Error(advanceError.message)
    },
  })
}
