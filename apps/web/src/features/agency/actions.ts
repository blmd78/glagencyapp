'use server'

// Écritures du calendrier Agence — ADMIN seul. Service-role après la garde : `agency_events` n'a
// AUCUNE policy d'écriture (0175), comme le reste des écritures sensibles du projet.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { adminGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { eventIdInput, eventInput, eventRow } from './schema'

/** Crée l'événement (sans `id`) ou le modifie. Une modification ne renotifie personne. */
export async function saveEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await requireAdminProfileLive()
      const admin = createAdminClient()
      const { error } = v.id
        ? await admin
            .from('agency_events')
            .update({ ...eventRow(v), updated_at: new Date().toISOString() })
            .eq('id', v.id)
        : await admin.from('agency_events').insert({ ...eventRow(v), created_by: profile.id })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/agence')
    },
  })
}

/** Supprime l'événement : il disparaît du calendrier et de la cloche de tout le monde. */
export async function deleteEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventIdInput,
    input: raw,
    guard: adminGuard,
    handler: async ({ id }) => {
      await requireAdminProfileLive()
      const { error } = await createAdminClient().from('agency_events').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/agence')
    },
  })
}
