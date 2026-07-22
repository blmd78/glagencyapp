'use server'

// Server Actions du tracker « Police » — supabase-js + RLS.
// Saisie/modif : page `police` requise. Suppression : admin uniquement.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess, type Profile } from '@/lib/auth'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { warningInput, malusInput, updateMalusInput } from './schema'

/** Garde : miroir de la policy RLS `police_insert`/`police_update` (`can_write_page('police')
 *  OR (is_police() AND has_page('police'))`) — `hasWriteAccess` couvre la 1ʳᵉ branche, le rôle
 *  fonctionnel `police` doit AUSSI avoir la page pour couvrir la 2ᵉ (sinon la RLS le bloquerait
 *  avec une erreur brute au lieu d'un refus propre ici). */
async function requirePoliceProfile(): Promise<Profile | null> {
  const profile = await getProfile()
  if (!profile) return null
  const isFunctionalPolice = profile.baseRole === 'police' && profile.pages.includes('police')
  return hasWriteAccess(profile, 'police') || isFunctionalPolice ? profile : null
}

/** Garde d'écriture Police (NON cloisonné, cf. 0078) : seule compte l'autorisation d'écriture de la
 *  page — aucun filtre chatteur/modèle. Partagée par les 3 mutations (avert./malus/édition). */
const policeWriteGuard = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  const profile = await requirePoliceProfile()
  return profile ? { ok: true } : { ok: false, error: 'Accès refusé' }
}

/** La cible d'une sanction doit être un MEMBRE role chatteur (cohérent avec la validation des lignes
 *  du Rapport). Défense en profondeur : les options n'exposent que des chatteurs, mais un appel forgé
 *  par un porteur de la page pourrait viser un manager/admin. Client admin (lecture d'un profil hors
 *  périmètre RLS de l'appelant). */
async function assertChatteurMember(chatterId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('role').eq('id', chatterId).maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.role !== 'chatteur') throw new BusinessError('La cible n’est pas un chatteur')
}

export async function addPoliceWarning(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: warningInput,
    input: raw,
    guard: policeWriteGuard,
    handler: async (values) => {
      // Dette guard+handler : getProfile refait la requête ici (cache() inopérant hors RSC) — cf. docs/guidelines-standard-feature.md §4
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer
      await assertChatteurMember(values.chatterId)
      const supabase = await createClient()
      const { error } = await supabase.from('police_entries').insert({
        chatter_id: values.chatterId,
        controller_id: profile.id,
        occurred_on: values.day,
        kind: 'warning',
        error_key: values.errorKey,
        amount_eur: 0,
        shift: values.shift ?? null,
      })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/police')
    },
  })
}

export async function addPoliceMalus(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: malusInput,
    input: raw,
    guard: policeWriteGuard,
    handler: async (values) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer
      await assertChatteurMember(values.chatterId)
      const supabase = await createClient()
      const { error } = await supabase.from('police_entries').insert({
        chatter_id: values.chatterId,
        controller_id: profile.id,
        occurred_on: values.day,
        kind: 'malus',
        error_key: values.errorKey ?? null,
        amount_eur: values.amountEur,
        note: values.note ?? null,
        shift: values.shift ?? null,
      })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/police')
    },
  })
}

export async function updatePoliceMalus(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateMalusInput,
    input: raw,
    guard: policeWriteGuard,
    handler: async (values) => {
      const supabase = await createClient()
      const { error } = await supabase
        .from('police_entries')
        .update({ amount_eur: values.amountEur, note: values.note ?? null })
        .eq('id', values.id)
        .eq('kind', 'malus')
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/police')
    },
  })
}

const deleteEntryInput = z.object({ id: z.uuid() })

export async function deletePoliceEntry(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteEntryInput,
    input: raw,
    guard: adminGuard,
    handler: async ({ id }) => {
      const supabase = await createClient()
      const { error } = await supabase.from('police_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/police')
    },
  })
}
