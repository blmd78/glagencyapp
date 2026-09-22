'use server'

// Server Actions Uncove — écriture ADMIN uniquement (comptes + tokens), en SERVICE-ROLE après
// garde `requireAdminProfileLive` (refus en « en tant que »). Le token est vérifié contre Uncove
// puis chiffré (encryptToken, clé UNCOVE_TOKEN_SECRET) avant stockage.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, encryptToken } from '@glagency/db'
import { verifyToken, decodeUserId } from '@glagency/uncove'
import { runAction, noGuard, requireAdminProfileLive, BusinessError, type ActionResult } from '@/lib/actions'
import { addUncoveAccountSchema, setUncoveLinkSchema } from './uncove.schema'

const PATH = '/chatter/uncove'
// Le CA Uncove entre dans l'Overview (0164) : un rattachement ou un décochage change ce qu'elle
// affiche → on invalide les deux pages, pas seulement l'écran des comptes.
const OVERVIEW_PATH = '/chatter/overview'

/** Décode l'identité Uncove du jeton et vérifie qu'il est actif ; sinon refus métier explicite. */
async function assertUsableToken(token: string): Promise<string> {
  let uncoveUserId: string
  try {
    uncoveUserId = decodeUserId(token)
  } catch {
    throw new BusinessError('Jeton invalide (format JWT attendu — colle le user_token complet).')
  }
  if (!(await verifyToken(token))) {
    throw new BusinessError('Jeton refusé par Uncove — reconnecte-toi et recopie un user_token frais.')
  }
  return uncoveUserId
}

export async function addUncoveAccount(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: addUncoveAccountSchema,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireAdminProfileLive()
      const uncoveUserId = await assertUsableToken(values.token)
      const db = createAdminClient()
      const { data, error } = await db
        .from('uncove_accounts')
        .insert({
          label: values.label,
          uncove_user_id: uncoveUserId,
          currency: 'eur',
          status: 'ok',
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') throw new BusinessError('Ce compte Uncove est déjà enregistré.')
        throw new Error(error.message)
      }
      const { error: e2 } = await db
        .from('uncove_account_tokens')
        .insert({ account_id: data.id, token_encrypted: encryptToken(values.token) })
      if (e2) throw new Error(e2.message)
      revalidatePath(PATH)
    },
  })
}

const reconnectSchema = z.object({
  id: z.uuid(),
  token: z.string().trim().min(20, 'Jeton trop court'),
})

/** Recolle un jeton frais sur un compte « à reconnecter » (doit être le MÊME compte Uncove). */
export async function reconnectUncoveAccount(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: reconnectSchema,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfileLive()
      const uncoveUserId = await assertUsableToken(values.token)
      const db = createAdminClient()
      const { data, error } = await db
        .from('uncove_accounts')
        .select('uncove_user_id')
        .eq('id', values.id)
        .single()
      if (error) throw new Error(error.message)
      if (data.uncove_user_id !== uncoveUserId) {
        throw new BusinessError('Ce jeton appartient à un autre compte Uncove.')
      }
      const { error: e2 } = await db
        .from('uncove_account_tokens')
        .upsert({ account_id: values.id, token_encrypted: encryptToken(values.token), updated_at: new Date().toISOString() }, {
          onConflict: 'account_id',
        })
      if (e2) throw new Error(e2.message)
      const { error: e3 } = await db
        .from('uncove_accounts')
        .update({ status: 'ok' })
        .eq('id', values.id)
      if (e3) throw new Error(e3.message)
      revalidatePath(PATH)
    },
  })
}

const removeSchema = z.object({ id: z.uuid() })

export async function removeUncoveAccount(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: removeSchema,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfileLive()
      const { error } = await createAdminClient()
        .from('uncove_accounts')
        .delete()
        .eq('id', values.id)
      if (error) throw new Error(error.message)
      revalidatePath(PATH)
    },
  })
}

/**
 * Rattache un compte à une modèle CRM et décide s'il compte dans le CA de l'agence.
 * Le rattachement est MANUEL et facultatif : sans modèle, le CA remonte quand même dans le CA
 * global de l'Overview, simplement sans ligne au classement par modèle (cf. 0164).
 */
export async function setUncoveAccountLink(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: setUncoveLinkSchema,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      await requireAdminProfileLive()
      const { error } = await createAdminClient()
        .from('uncove_accounts')
        .update({ creator_id: values.creatorId, counts_in_ca: values.countsInCa })
        .eq('id', values.id)
      if (error) throw new Error(error.message)
      revalidatePath(PATH)
      revalidatePath(OVERVIEW_PATH)
    },
  })
}
