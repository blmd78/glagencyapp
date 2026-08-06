'use server'

// Server Actions du tracker « Police » — supabase-js + RLS.
// Saisie/modif/suppression : mêmes écrivains (0106 a aligné police_delete sur insert/update).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess, type Profile } from '@/lib/auth'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { warningInput, malusInput, updateMalusInput } from './schema'

/** Contrôle d'écriture Police (NON cloisonné, cf. 0078) : miroir de la policy RLS
 *  `police_insert`/`police_update` (`can_write_page('police')` OR (`is_police()` AND
 *  `has_page('police')`)) — `hasWriteAccess` couvre la 1ʳᵉ branche, le rôle fonctionnel
 *  `police` doit AUSSI avoir la page pour couvrir la 2ᵉ (sinon la RLS le bloquerait avec une
 *  erreur brute au lieu d'un refus propre ici). Vérifié UNE SEULE FOIS, en tête de handler
 *  (patron §4 des guidelines) — refus = BusinessError, aucun filtre chatteur/modèle. */
async function requirePoliceProfile(): Promise<Profile> {
  const profile = await getProfile()
  const isFunctionalPolice =
    !!profile && profile.baseRole === 'police' && profile.pages.includes('police')
  if (!profile || !(hasWriteAccess(profile, 'police') || isFunctionalPolice)) {
    throw new BusinessError('Accès refusé')
  }
  return profile
}

/** La cible d'une sanction doit être un MEMBRE role chatteur (cohérent avec la validation des lignes
 *  du Rapport). Défense en profondeur : les options n'exposent que des chatteurs, mais un appel forgé
 *  par un porteur de la page pourrait viser un manager/admin. Client admin (lecture d'un profil hors
 *  périmètre RLS de l'appelant). */
async function assertChatteurMember(chatterId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('role').eq('id', chatterId).maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.role !== 'chatteur') throw new BusinessError('La cible n’est pas un chatter')
}

export async function addPoliceWarning(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: warningInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requirePoliceProfile()
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
    guard: noGuard,
    handler: async (values) => {
      const profile = await requirePoliceProfile()
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
    guard: noGuard,
    handler: async (values) => {
      await requirePoliceProfile()
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
    // Même règle que la saisie depuis 0106 (« qui peut poser une sanction peut la retirer ») —
    // adminGuard avant ça. Le miroir RLS est `police_delete`, alignée sur insert/update.
    guard: noGuard,
    handler: async ({ id }) => {
      await requirePoliceProfile()
      const supabase = await createClient()
      const { error } = await supabase.from('police_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/police')
    },
  })
}
