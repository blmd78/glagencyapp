'use server'

// Écritures du calendrier Agence — ADMIN seul. Service-role après vérification du profil
// admin dans le handler : `agency_events`, `agency_legend` et le bucket `agency-events` n'ont
// AUCUNE policy d'écriture (0175, 0176), comme le reste des écritures sensibles du projet.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { eventIdInput, eventInput, eventRow, IMAGE_TYPES, imageUploadInput, legendInput } from './schema'

const BUCKET = 'agency-events'

/** Retire une photo qui ne sert plus. Best effort : un objet orphelin ne gêne personne. */
async function removeImage(path: string | null | undefined) {
  if (path) await createAdminClient().storage.from(BUCKET).remove([path])
}

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
        const { data: before, error: readError } = await admin
          .from('agency_events')
          .select('image_path')
          .eq('id', v.id)
          .maybeSingle()
        if (readError) throw new Error(readError.message)
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
        // Photo remplacée ou retirée PAR CETTE FENÊTRE (`imagePath` défini) : l'ancienne part,
        // APRÈS l'écriture réussie. Photo non touchée (`undefined`) : rien n'est écrit ni effacé.
        if (v.imagePath !== undefined && before?.image_path !== v.imagePath) await removeImage(before?.image_path)
      } else {
        const { error } = await admin.from('agency_events').insert({ ...eventRow(v), created_by: profile.id })
        if (error) throw new Error(error.message)
      }
      revalidatePath('/chatter/agence')
    },
  })
}

/** Supprime l'événement : il disparaît du calendrier et de la cloche de tout le monde, sa photo avec. */
export async function deleteEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      await requireAdminProfileLive()
      const { data, error } = await createAdminClient().from('agency_events').delete().eq('id', id).select('image_path')
      if (error) throw new Error(error.message)
      await removeImage(data[0]?.image_path)
      revalidatePath('/chatter/agence')
    },
  })
}

/**
 * L'URL d'envoi d'une photo : le navigateur y dépose le fichier DIRECTEMENT dans le bucket, sans
 * passer par Vercel (dont le corps de requête est plafonné). Format et poids revérifiés ici, puis
 * par le bucket lui-même (0176) — le client n'est jamais cru sur parole. La clé est tirée côté
 * serveur : l'admin ne choisit ni le nom ni l'emplacement.
 */
export async function createImageUpload(raw: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  return runAction({
    schema: imageUploadInput,
    input: raw,
    guard: noGuard,
    handler: async ({ contentType }) => {
      await requireAdminProfileLive()
      const path = `${randomUUID()}.${IMAGE_TYPES[contentType]}`
      const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path)
      if (error) throw new Error(error.message)
      return { path: data.path, token: data.token }
    },
  })
}

/** Le nom de chaque couleur. Un nom vidé retire la couleur de la légende. */
export async function saveLegend(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: legendInput,
    input: raw,
    guard: noGuard,
    handler: async ({ items }) => {
      await requireAdminProfileLive()
      const admin = createAdminClient()
      const named = items.filter((i) => i.label !== '')
      const cleared = items.filter((i) => i.label === '').map((i) => i.color)
      if (named.length > 0) {
        const { error } = await admin
          .from('agency_legend')
          .upsert(named.map((i) => ({ color: i.color, label: i.label, updated_at: new Date().toISOString() })))
        if (error) throw new Error(error.message)
      }
      if (cleared.length > 0) {
        const { error } = await admin.from('agency_legend').delete().in('color', cleared)
        if (error) throw new Error(error.message)
      }
      revalidatePath('/chatter/agence')
    },
  })
}
