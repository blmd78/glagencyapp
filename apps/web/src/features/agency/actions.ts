'use server'

// Écritures du calendrier Agence — ADMIN seul. Service-role après vérification du profil
// admin dans le handler : `agency_events` n'a AUCUNE policy d'écriture (0175), comme le reste
// des écritures sensibles du projet.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { eventIdInput, eventInput, eventRow } from './schema'

/** Crée l'événement (sans `id`) ou le modifie. Une modification ne renotifie personne. */
export async function saveEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventInput,
    input: raw,
    guard: noGuard,
    handler: async (v) => {
      const profile = await requireAdminProfileLive()
      const admin = createAdminClient()
      if (v.id) {
        // `.select('id')` détecte un événement supprimé entre-temps (un autre admin, un autre
        // onglet) : sans ligne rendue, l'`update` a réussi sans rien changer — c'est un conflit
        // MÉTIER, pas une erreur technique de `runAction`.
        const { data, error } = await admin
          .from('agency_events')
          .update({ ...eventRow(v), updated_at: new Date().toISOString() })
          .eq('id', v.id)
          .select('id')
        if (error) throw new Error(error.message)
        if (data.length === 0) throw new BusinessError('Cet événement n’existe plus — il a sans doute été supprimé.')
      } else {
        const { error } = await admin.from('agency_events').insert({ ...eventRow(v), created_by: profile.id })
        if (error) throw new Error(error.message)
      }
      revalidatePath('/chatter/agence')
    },
  })
}

/** Supprime l'événement : il disparaît du calendrier et de la cloche de tout le monde. */
export async function deleteEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      await requireAdminProfileLive()
      const { error } = await createAdminClient().from('agency_events').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/agence')
    },
  })
}
