'use server'

// Server Actions du pôle marketing-social. La saisie manuelle des CHIFFRES reste abandonnée
// (décision Benoît : Instagram, Telegram et X sont collectés automatiquement —
// `saveSocialEntries`/`addSocialAccount` retirés ~2026-07). Seule la LISTE des comptes X à
// relever se gère ici (demande Benoit 2026-09-29 : « une liste de tous les pseudos, et qu'on
// puisse y ajouter les suivants »).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizeXHandle, parseXHandleList } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'

export interface AddXAccountsResult {
  added: string[]
  reactivated: string[]
  existing: string[]
  /** Entrées refusées, telles que saisies. */
  invalid: string[]
}

const addXAccountsSchema = z.object({ text: z.string().max(20_000) })

/**
 * Ajoute au relevé X les pseudos collés (un par ligne). ADMIN seul : chaque compte ajouté coûte
 * 0,010 $ par nuit (API X, job `marketing-x`). Un pseudo déjà suivi est ignoré — comparé SANS la
 * casse, alors que l'unicité (platform, handle) de 0018 y est sensible — et un compte désactivé
 * est réactivé plutôt que dupliqué. Relevés dès la nuit suivante.
 */
export async function addXAccounts(raw: unknown): Promise<ActionResult<AddXAccountsResult>> {
  return runAction({
    schema: addXAccountsSchema,
    input: raw,
    guard: adminGuard,
    handler: async ({ text }) => {
      const { handles, invalid } = parseXHandleList(text)
      const supabase = await createClient()
      const known = await fetchAll((f, t) =>
        supabase
          .from('mkt_social_accounts')
          .select('id, handle, active')
          .eq('platform', 'twitter')
          .order('id')
          .range(f, t),
      )
      if (known.error) throw new Error(known.error.message)
      const byHandle = new Map((known.data ?? []).map((a) => [a.handle.toLowerCase(), a]))

      const added: string[] = []
      const reactivated: string[] = []
      const existing: string[] = []
      const toReactivate: string[] = []
      for (const h of handles) {
        const k = byHandle.get(h.toLowerCase())
        if (!k) {
          added.push(h)
        } else if (!k.active) {
          reactivated.push(k.handle)
          toReactivate.push(k.id)
        } else {
          existing.push(k.handle)
        }
      }

      if (added.length) {
        const { error } = await supabase
          .from('mkt_social_accounts')
          .insert(added.map((handle) => ({ platform: 'twitter', handle })))
        // 23505 : un de ces pseudos vient d'être ajouté entre notre lecture et l'insertion
        // (index sans la casse de 0177). Rien n'est écrit — l'insertion est atomique.
        if (error?.code === '23505') {
          throw new BusinessError('Un de ces comptes vient d’être ajouté entre-temps : recharge la page et recommence.')
        }
        if (error) throw new Error(error.message)
      }
      if (toReactivate.length) {
        const { error } = await supabase.from('mkt_social_accounts').update({ active: true }).in('id', toReactivate)
        if (error) throw new Error(error.message)
      }
      if (added.length || reactivated.length) revalidatePath('/marketing/twitter')
      return { added, reactivated, existing, invalid }
    },
  })
}

const updateXHandleSchema = z.object({ accountId: z.uuid(), handle: z.string().max(200) })

const TAKEN = 'Ce pseudo est déjà dans la liste.'

/**
 * Corrige le pseudo d'un compte X que le relevé n'a pas trouvé (« ⚠ introuvable » ou
 * « ⚠ suspendu », demande Benoit 2026-09-29). ADMIN seul, comme l'ajout. L'identifiant X est
 * EFFACÉ : le compte est cherché sous son nouveau pseudo au relevé suivant, qui reposera
 * l'identifiant — sans ça, un identifiant périmé ferait chercher l'ancien compte.
 */
export async function updateXHandle(raw: unknown): Promise<ActionResult<{ handle: string }>> {
  return runAction({
    schema: updateXHandleSchema,
    input: raw,
    guard: adminGuard,
    handler: async ({ accountId, handle: typed }) => {
      const handle = normalizeXHandle(typed)
      if (!handle) throw new BusinessError('Ce n’est pas un pseudo X : 1 à 15 lettres, chiffres ou « _ ».')
      const supabase = await createClient()
      const known = await fetchAll((f, t) =>
        supabase
          .from('mkt_social_accounts')
          .select('id, handle')
          .eq('platform', 'twitter')
          .order('id')
          .range(f, t),
      )
      if (known.error) throw new Error(known.error.message)
      if ((known.data ?? []).some((a) => a.id !== accountId && a.handle.toLowerCase() === handle.toLowerCase())) {
        throw new BusinessError(TAKEN)
      }

      const { data, error } = await supabase
        .from('mkt_social_accounts')
        .update({ handle, x_user_id: null })
        .eq('id', accountId)
        .eq('platform', 'twitter')
        .select('id')
      // 23505 : pris entre notre lecture et l'écriture (index sans la casse de 0177).
      if (error?.code === '23505') throw new BusinessError(TAKEN)
      if (error) throw new Error(error.message)
      if (!data?.length) throw new BusinessError('Ce compte n’est plus dans la liste : recharge la page.')
      revalidatePath('/marketing/twitter')
      return { handle }
    },
  })
}
