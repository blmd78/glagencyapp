'use server'

// Server Actions du tracker « Police » — supabase-js + RLS.
// Saisie/modif/suppression : mêmes écrivains (0106 a aligné police_delete sur insert/update).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { canWritePolice, getProfile, type Profile } from '@/lib/auth'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
import { runAction, noGuard, BusinessError, DENY_WRITE, type ActionResult } from '@/lib/actions'
import { isDayInWindow } from '@/lib/periods'
import { warningInput, malusInput, updateEntryInput } from './schema'

/** Contrôle d'écriture Police — `canWritePolice` (lib/auth, SOURCE UNIQUE, miroir RLS 0078) ;
 *  vérifié UNE SEULE FOIS, en tête de handler (patron §4) — refus = BusinessError. */
async function requirePoliceProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (!canWritePolice(profile)) throw new BusinessError(DENY_WRITE)
  return profile
}

/** PÉRIMÈTRE PAR MODÈLE côté ÉCRITURE (audit 2026-08-06) : le cloisonnement de l'affichage
 *  (`getPolice`) ne suffit pas — sans cette garde, un encadrant/policier cloisonné pouvait
 *  forger un appel et sanctionner (ou modifier/supprimer la sanction de) n'importe quel
 *  chatteur de l'agence, malus de paie compris. La RLS 0078 reste volontairement large :
 *  cette garde serveur est le rempart réel du périmètre. */
async function requireChatterInScope(profile: Profile, chatterId: string): Promise<void> {
  const scope = await getCreatorScope(profile.id, profile.baseRole)
  if (!(await isChatterInScope(scope, chatterId)))
    throw new BusinessError('Ce chatter n’est pas sur tes modèles')
}

/** La cible d'une sanction doit être un MEMBRE role chatteur, ENCORE EN POSTE (un parti — 0102 —
 *  ne se sanctionne plus : sa paie ne doit plus bouger ; cohérent avec `getChattersByModel` qui
 *  l'exclut des options). Défense en profondeur : les options n'exposent que des chatteurs
 *  actifs, mais un appel forgé pourrait viser un manager/admin/parti. Client admin (lecture
 *  d'un profil hors périmètre RLS de l'appelant). */
async function assertChatteurMember(chatterId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('role, left_at')
    .eq('id', chatterId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.role !== 'chatteur') throw new BusinessError('La cible n’est pas un chatter')
  if (data.left_at) throw new BusinessError('Ce membre a quitté l’agence')
}

/** Le chatteur d'une entrée EXISTANTE (édition/suppression) — pour lui appliquer le périmètre. */
async function chatterOfEntry(id: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('police_entries')
    .select('chatter_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError('Cette entrée n’existe plus')
  return data.chatter_id
}

export async function addPoliceWarning(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: warningInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requirePoliceProfile()
      await assertChatteurMember(values.chatterId)
      await requireChatterInScope(profile, values.chatterId)
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
      await requireChatterInScope(profile, values.chatterId)
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

/** Édition COMPLÈTE d'une entrée (dialog pré-rempli, 2026-08-17) : date, chatteur, erreur,
 *  shift, montant, motif — le `kind` suit le montant comme à la pose. */
export async function updatePoliceEntry(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateEntryInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requirePoliceProfile()
      // L'entrée EXISTANTE : périmètre sur SON chatteur + date d'origine (règle de fenêtre).
      const admin = createAdminClient()
      const { data: existing, error: exErr } = await admin
        .from('police_entries')
        .select('chatter_id, occurred_on')
        .eq('id', values.id)
        .maybeSingle()
      if (exErr) throw new Error(exErr.message)
      if (!existing) throw new BusinessError('Cette entrée n’existe plus')
      await requireChatterInScope(profile, existing.chatter_id)
      // RE-dater est borné à la fenêtre de saisie (miroir de `dayZ`) ; la date D'ORIGINE reste
      // toujours permise — une sanction vieille de 3 semaines doit rester éditable sans bouger.
      if (values.day !== existing.occurred_on && !isDayInWindow(values.day))
        throw new BusinessError('Date hors de la période autorisée')
      // Cible CHANGÉE : mêmes gardes qu'à la pose (membre chatteur en poste + périmètre).
      if (values.chatterId !== existing.chatter_id) {
        await assertChatteurMember(values.chatterId)
        await requireChatterInScope(profile, values.chatterId)
      }
      const isMalus = values.amountEur > 0
      const supabase = await createClient()
      // `.select()` + contrôle : sans lui, un refus RLS (0 ligne) passerait pour un succès et
      // l'UI dirait « Sanction modifiée » (audit 2026-08-06) — le refus du rempart doit se voir.
      const { data, error } = await supabase
        .from('police_entries')
        .update({
          chatter_id: values.chatterId,
          occurred_on: values.day,
          kind: isMalus ? 'malus' : 'warning',
          error_key: values.errorKey ?? null,
          amount_eur: values.amountEur,
          // Le motif est réservé au malus (le form le désactive ; on n'en garde pas un orphelin).
          note: isMalus ? (values.note ?? null) : null,
          shift: values.shift ?? null,
        })
        .eq('id', values.id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Cette entrée n’existe plus ou t’est interdite')
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
      const profile = await requirePoliceProfile()
      // Périmètre sur l'entrée EXISTANTE (audit 2026-08-06 : sans ça, tout écrivain pouvait
      // énumérer les ids par l'API et supprimer n'importe quelle sanction de l'agence).
      await requireChatterInScope(profile, await chatterOfEntry(id))
      const supabase = await createClient()
      // `.select()` + contrôle : un refus RLS ne doit pas passer pour un succès (cf. update).
      const { data, error } = await supabase
        .from('police_entries')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Cette entrée n’existe plus ou t’est interdite')
      revalidatePath('/chatter/police')
    },
  })
}
