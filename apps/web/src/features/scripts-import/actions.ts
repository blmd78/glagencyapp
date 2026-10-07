'use server'
import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizeDraft, summarizeDraft, validateScriptDraft } from '@glagency/core'
import { createAdminClient, type Database, type Json } from '@glagency/db'
import { convertToDraft, describeFailure, fetchNotionPage, sendScript, studioWriter } from '@glagency/scripts'
import { SCRIPTS_SESSION_ID, ingestSessionStore, scriptsSessionForSend } from '@glagency/scripts/session'
import {
  BusinessError,
  DENY_IMPERSONATION,
  DENY_STAFF,
  noGuard,
  requireAdminProfileLive,
  runAction,
  type ActionResult,
} from '@/lib/actions'
import { anthropic } from '@/lib/ai/client'
import { getProfile, type Profile } from '@/lib/auth'
import { readStateCookie } from '@/lib/impersonation/session'
import { createClient } from '@/lib/supabase/server'
import { canSend } from './rules'
import { prepareImportSchema } from './schemas'
import { checkDraftForSend } from './send-rules'
import { withCreationTrace } from './trace'
import { allowedCreators } from './services/get-scripts-import'
import { deleteNotionConnection, setNotionRootPage, withNotionToken } from './services/notion-connection'

const PAGE = '/chatter/import-scripts'

/** Admin ou encadrant (manager / sous-manager), jamais « en tant que » : on écrit chez un tiers. */
async function requireImporter(): Promise<Profile> {
  if (await readStateCookie()) throw new BusinessError(DENY_IMPERSONATION)
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && !profile.manager)) throw new BusinessError(DENY_STAFF)
  return profile
}

/** Lit le script dans Notion, le convertit, l'ajuste et le vérifie, puis l'enregistre `prepared` — rien chez MyPuls. */
export async function prepareImport(raw: unknown): Promise<ActionResult<{ importId: string }>> {
  return runAction({
    schema: prepareImportSchema,
    input: raw,
    guard: noGuard,
    handler: async ({ notionPageId, creatorId }) => {
      const profile = await requireImporter()
      if (!(await allowedCreators(profile)).some((c) => c.id === creatorId)) throw new BusinessError('Modèle hors de ton périmètre.')
      const page = await withNotionToken((token) => fetchNotionPage(token, notionPageId))
      if (!page) throw new BusinessError('Notion n’est pas connecté — demande à un admin.')
      let converted: Awaited<ReturnType<typeof convertToDraft>>
      try {
        converted = await convertToDraft(anthropic(), page)
      } catch (e) {
        const msg = (e as Error).message
        // Refus du modèle ou sortie tronquée : des issues attendues, dites telles quelles au manager.
        if (msg.startsWith('conversion ')) throw new BusinessError(`Conversion impossible : ${msg}.`)
        throw e
      }
      const { draft, notes } = normalizeDraft(converted.draft)
      const errors = validateScriptDraft(draft)
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('script_imports')
        .insert({
          created_by: profile.id,
          creator_id: creatorId,
          notion_page_id: notionPageId,
          notion_title: page.title || 'Sans titre',
          // Colonnes jsonb : objets du domaine sérialisables tels quels.
          summary: summarizeDraft(draft) as unknown as Json,
          notes: notes as unknown as Json,
          errors: errors as unknown as Json,
          draft: draft as unknown as Json,
          usage: converted.usage as unknown as Json,
        })
        .select('id')
        .single()
      // 42501 = refus RLS : la modèle n'est pas dans le périmètre (le vrai verrou, côté base).
      if (error?.code === '42501') throw new BusinessError('Modèle hors de ton périmètre.')
      if (error) throw new Error(error.message)
      revalidatePath(PAGE)
      return { importId: (data as { id: string }).id }
    },
  })
}

type SendRow = {
  id: string
  created_by: string
  status: 'prepared' | 'sending' | 'sent' | 'failed'
  errors: unknown[]
  draft: unknown
  created_at: string
  sent_at: string | null
  mypuls_script_id: number | null
  creators: { mypuls_creator_id: string | null; name: string } | null
}

/** Envoie un import `prepared` sans erreur dans le Studio MyPuls de la modèle — script créé DÉSACTIVÉ. */
export async function sendImport(raw: unknown): Promise<ActionResult<{ mypulsScriptId: number }>> {
  return runAction({
    schema: z.object({ importId: z.uuid() }),
    input: raw,
    guard: noGuard,
    handler: async ({ importId }) => {
      const profile = await requireImporter()
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('script_imports')
        .select('id, created_by, status, errors, draft, created_at, sent_at, mypuls_script_id, creators:creator_id (mypuls_creator_id, name)')
        .eq('id', importId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const row = data as unknown as SendRow | null
      if (!row) throw new BusinessError('Import introuvable.')
      const check = canSend(
        {
          id: row.id,
          createdBy: row.created_by,
          status: row.status,
          errorsCount: Array.isArray(row.errors) ? row.errors.length : 0,
          createdAt: row.created_at,
          sentAt: row.sent_at,
          mypulsScriptId: row.mypuls_script_id,
        },
        profile.id,
      )
      if (!check.ok) throw new BusinessError(check.reason)
      const mypulsId = row.creators?.mypuls_creator_id
      if (!mypulsId) throw new BusinessError('Cette modèle n’est pas reliée à MyPuls.')
      // Vérification complète du brouillon RELU, pas de la colonne `errors` (spec § 6).
      const verified = checkDraftForSend(row.draft)
      if (!verified.ok) throw new BusinessError(verified.reason)
      const draft = verified.draft

      // Verrou anti double-clic : seule la première requête fait passer la ligne de prepared à sending.
      const { data: locked, error: lockError } = await supabase
        .from('script_imports')
        .update({ status: 'sending', sent_at: new Date().toISOString() })
        .eq('id', importId)
        .eq('status', 'prepared')
        .select('id')
      if (lockError) throw new Error(lockError.message)
      if (!locked?.length) throw new BusinessError('Cet import est déjà parti ou en cours d’envoi.')

      const finish = async (patch: Database['public']['Tables']['script_imports']['Update']) => {
        const { error: e } = await supabase.from('script_imports').update(patch).eq('id', importId)
        if (e) throw new Error(e.message)
      }
      let result: Awaited<ReturnType<typeof sendScript>>
      try {
        const cookie = await scriptsSessionForSend(
          ingestSessionStore(createAdminClient(), SCRIPTS_SESSION_ID),
          process.env.MYPULS_SCRIPTS_SESSION_COOKIE,
        )
        // L'id du script est enregistré DÈS sa création ; une panne de cette trace n'interrompt pas l'envoi.
        const writer = withCreationTrace(
          studioWriter(cookie),
          (id) => finish({ mypuls_script_id: id }),
          (e) => Sentry.captureException(e),
        )
        result = await sendScript(writer, mypulsId, draft)
      } catch (e) {
        await finish({ status: 'failed', failed_step: 'session MyPuls', error: (e as Error).message })
        revalidatePath(PAGE)
        throw new BusinessError(`Envoi impossible : ${(e as Error).message}`)
      }
      if (result.ok) {
        // Envoi RÉUSSI : une panne de la trace finale ne le transforme pas en échec affiché au manager.
        await finish({ status: 'sent', mypuls_script_id: result.scriptId, sent_at: new Date().toISOString() }).catch((e: unknown) =>
          Sentry.captureException(e),
        )
        revalidatePath(PAGE)
        return { mypulsScriptId: result.scriptId }
      }
      await finish({
        status: 'failed',
        mypuls_script_id: result.scriptId,
        failed_step: result.step,
        error: result.error,
        cleanup: result.cleanup as unknown as Json,
      }).catch((e: unknown) => Sentry.captureException(e))
      revalidatePath(PAGE)
      throw new BusinessError(describeFailure(result, draft.name))
    },
  })
}

/** Admin : la page racine du Notion d'agence (parmi les pages partagées de premier niveau). */
export async function setRootPage(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.object({ pageId: z.string().min(1) }),
    input: raw,
    guard: noGuard,
    handler: async ({ pageId }) => {
      await requireAdminProfileLive()
      await setNotionRootPage(pageId)
      revalidatePath(PAGE)
    },
  })
}

/** Admin : déconnecte Notion (la clé est supprimée du CRM ; la connexion se retire aussi dans Notion). */
export async function disconnectNotion(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.object({}),
    input: raw,
    guard: noGuard,
    handler: async () => {
      await requireAdminProfileLive()
      await deleteNotionConnection()
      revalidatePath(PAGE)
    },
  })
}
