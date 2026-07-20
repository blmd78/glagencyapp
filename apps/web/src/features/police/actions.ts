'use server'

// Server Actions du tracker « Police » — supabase-js + RLS.
// Saisie/modif : page `police` requise. Suppression : admin uniquement.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess, type Profile } from '@/lib/auth'
import { getChatterScope } from '@/lib/scope'
import { runAction, adminGuard, type ActionResult } from '@/lib/actions'
import { warningInput, malusInput, updateMalusInput } from './schema'

/** Garde : admin, manager/sous-manager ayant la page `police`, OU le rôle fonctionnel
 *  `police` lui-même (chatteur en lecture seule). `hasWriteAccess` mirrore `can_write_page`
 *  (0060) et exclut donc `police` (non-encadrant) — mais la policy d'écriture de
 *  `police_entries` a été étendue en 0070 (`can_write_page('police') OR (is_police() AND
 *  has_page('police'))`, décision propriétaire : additif, les encadrants gardent leur droit).
 *  Miroir exact de cette policy, propre à cette feature — ne touche pas `hasWriteAccess`
 *  (qui reste correct pour toutes les autres pages `can_write_page`). */
async function requirePoliceProfile(): Promise<Profile | null> {
  const profile = await getProfile()
  if (!profile) return null
  // Ordre important : `hasWriteAccess` est un type predicate (`profile is Profile`) — évalué
  // en premier dans un `||`, TS narrowerait `profile` à `never` côté droit s'il rend `false`
  // (il était déjà `Profile`). Le test `baseRole` d'abord évite le souci.
  return profile.baseRole === 'police' || hasWriteAccess(profile, 'police') ? profile : null
}

/** Garde périmètre : un non-admin ne peut agir que sur les chatteurs de SES modèles. */
async function chatterInScope(profile: Profile, chatterId: string): Promise<boolean> {
  const scope = await getChatterScope(profile)
  return scope.chatterIds === null || scope.chatterIds.has(chatterId)
}

export async function addPoliceWarning(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: warningInput,
    input: raw,
    guard: async () => {
      const profile = await requirePoliceProfile()
      if (!profile) return { ok: false, error: 'Accès refusé' }
      // Parse défensif de `raw` (capturé par fermeture) : si invalide, laissé au safeParse
      // de runAction — pattern planning/scripts (docs/guidelines-standard-feature.md §4).
      const parsed = warningInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      if (!(await chatterInScope(profile, parsed.data.chatterId)))
        return { ok: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }
      return { ok: true }
    },
    handler: async (values) => {
      // ⚠️ getProfile est ré-exécuté ici : le `cache()` de React ne mémoïse QUE dans le rendu
      // d'un Server Component, pas dans une Server Action — cet appel refait donc réellement
      // la requête. Dette connue du patron guard+handler (cf. guidelines §4, corrigé dans
      // features/todos et features/planning) ; à reprendre lors du passage de cette feature.
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer
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
    guard: async () => {
      const profile = await requirePoliceProfile()
      if (!profile) return { ok: false, error: 'Accès refusé' }
      const parsed = malusInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      if (!(await chatterInScope(profile, parsed.data.chatterId)))
        return { ok: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }
      return { ok: true }
    },
    handler: async (values) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer
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
    guard: async () => {
      const profile = await requirePoliceProfile()
      if (!profile) return { ok: false, error: 'Accès refusé' }
      if (profile.role === 'admin') return { ok: true }
      const parsed = updateMalusInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      // Garde périmètre : un non-admin ne peut pas éditer le malus d'une autre équipe par id.
      const supabase = await createClient()
      const { data: entry } = await supabase
        .from('police_entries')
        .select('chatter_id')
        .eq('id', parsed.data.id)
        .maybeSingle()
      if (!entry || !(await chatterInScope(profile, entry.chatter_id)))
        return { ok: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }
      return { ok: true }
    },
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
