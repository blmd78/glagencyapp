'use server'
import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizeDraft, summarizeDraft, validateScriptDraft } from '@glagency/core'
import { createAdminClient, type Database, type Json } from '@glagency/db'
import {
  ConversionError,
  convertToDraft,
  describeFailure,
  describeMedia,
  gatherScript,
  sendScript,
  studioWriter,
} from '@glagency/scripts'
import { SCRIPTS_SESSION_ID, ScriptsSessionError, ingestSessionStore, scriptsSessionForSend } from '@glagency/scripts/session'
import {
  BusinessError,
  DENY_IMPERSONATION,
  DENY_STAFF,
  noGuard,
  runAction,
  type ActionResult,
} from '@/lib/actions'
import { anthropic } from '@/lib/ai/client'
import { getProfile, isAdminOrManager, type Profile } from '@/lib/auth'
import { readStateCookie } from '@/lib/impersonation/session'
import { createClient } from '@/lib/supabase/server'
import { firstWorkspaceWithPage } from './notion-pages'
import { canSend } from './rules'
import { prepareClaims, sendLock } from './locks'
import { prepareOnce } from './prepare-once'
import { prepareImportInput, prepareStatusInput } from './schema'
import { checkDraftForSend, notionReadMessage, prepareRefusal, withSendLock } from './send-rules'
import { withCreationTrace } from './trace'
import { allowedCreators } from './services/get-scripts-import'
import type { PrepareState } from './wait-prepared'
import { deleteNotionConnection, getNotionConnections, withNotionToken, type Viewer } from './services/notion-connection'

const PAGE = '/chatter/import-scripts'

/** Admin ou encadrant (manager / sous-manager), jamais « en tant que » : on écrit chez un tiers. */
async function requireImporter(): Promise<Profile> {
  if (await readStateCookie()) throw new BusinessError(DENY_IMPERSONATION)
  const profile = await getProfile()
  if (!profile || !isAdminOrManager(profile)) throw new BusinessError(DENY_STAFF)
  return profile
}

/** Lit le script dans Notion (page, PDF, pages liées), le convertit, l'ajuste et le vérifie, puis l'enregistre `prepared` — rien chez MyPuls. */
export async function prepareImport(raw: unknown): Promise<ActionResult<{ importId: string }>> {
  return runAction({
    schema: prepareImportInput,
    input: raw,
    guard: noGuard,
    handler: async ({ notionPageId, creatorId, connectionId, requestId }) => {
      const profile = await requireImporter()
      if (!(await allowedCreators(profile)).some((c) => c.id === creatorId)) throw new BusinessError('Modèle hors de ton périmètre.')
      const supabase = await createClient()
      // Une préparation par clic : une copie de la requête attend l'import de la première (0189).
      const importId = await prepareOnce(
        prepareClaims(supabase, profile.id),
        requestId,
        () => prepare({ supabase, profileId: profile.id, viewer: { id: profile.id, role: profile.role }, notionPageId, creatorId, connectionId }),
        { report: (e) => Sentry.captureException(e) },
      )
      revalidatePath(PAGE)
      return { importId }
    },
  })
}

/**
 * Où en est une préparation dont la réponse a été coupée (connexion perdue à 60 s, test réel du
 * 2026-10-08) : relit SA clé (client RLS) — lecture seule, rien n'est relancé. Lu par `waitPrepared`.
 */
export async function prepareStatus(raw: unknown): Promise<ActionResult<PrepareState>> {
  return runAction({
    schema: prepareStatusInput,
    input: raw,
    guard: noGuard,
    handler: async ({ requestId }) => {
      const profile = await requireImporter()
      return prepareClaims(await createClient(), profile.id).lookup(requestId)
    },
  })
}

/** Lecture de toutes les sources (`gatherScript`), conversion, ajustement, vérification, puis la ligne `prepared` — renvoie son id. */
async function prepare({
  supabase,
  profileId,
  viewer,
  notionPageId,
  creatorId,
  connectionId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  profileId: string
  viewer: Viewer
  notionPageId: string
  creatorId: string
  connectionId: string | undefined
}): Promise<string> {
  // Seulement les espaces VISIBLES par l'appelant (partagés, ou connectés par lui — 0192) : un id de
  // connexion envoyé par le navigateur ne donne jamais accès au Notion perso d'un autre.
  const visible = (await getNotionConnections(viewer)).map((c) => c.id)
  if (connectionId && !visible.includes(connectionId)) throw new BusinessError('Espace Notion inaccessible : reconnecte ton Notion.')
  // Script de la liste : son espace est connu. Lien collé : on le cherche dans chaque espace visible.
  const spaces = connectionId ? [connectionId] : visible
  if (!spaces.length) throw new BusinessError('Aucun Notion connecté : connecte le tien en haut de la page.')
  const hit = await firstWorkspaceWithPage(spaces, (id) => withNotionToken(id, (token) => gatherScript(token, notionPageId))).catch(
    (e: unknown) => {
      // Clé expirée, débit limité : dit au manager ; le reste est technique (Sentry + générique).
      const msg = notionReadMessage(e)
      throw msg ? new BusinessError(msg) : e
    },
  )
  if (!hit) throw new BusinessError('Page Notion introuvable, ou pas partagée avec le CRM (Partager → Connexions → GL Agency CRM).')
  const page = hit.value
  // Avant de payer la conversion : un prompt, ou une page proposée par erreur (sommaire, page média, fiche).
  const refusal = prepareRefusal(page)
  if (refusal) throw new BusinessError(refusal)
  let converted: Awaited<ReturnType<typeof convertToDraft>>
  try {
    converted = await convertToDraft(anthropic(), page)
  } catch (e) {
    // Refus du modèle ou sortie tronquée : des issues attendues, dites telles quelles au manager.
    if (e instanceof ConversionError) throw new BusinessError(`Conversion impossible : ${e.message}.`)
    throw e
  }
  const { draft, notes } = normalizeDraft(converted.draft)
  const errors = validateScriptDraft(draft)
  const { data, error } = await supabase
    .from('script_imports')
    .insert({
      created_by: profileId,
      creator_id: creatorId,
      notion_page_id: notionPageId,
      notion_title: page.title || 'Sans titre',
      // Colonnes jsonb : objets du domaine sérialisables tels quels.
      summary: summarizeDraft(draft) as unknown as Json,
      notes: notes as unknown as Json,
      errors: errors as unknown as Json,
      draft: draft as unknown as Json,
      usage: converted.usage as unknown as Json,
      sources: page.sources as unknown as Json,
      source_text: page.text,
    })
    .select('id')
    .single()
  // 42501 = refus RLS : la modèle n'est pas dans le périmètre (le vrai verrou, côté base).
  if (error?.code === '42501') throw new BusinessError('Modèle hors de ton périmètre.')
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
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
  notion_title: string
  creators: { mypuls_creator_id: string | null; name: string } | null
}

/** Envoie un import `prepared` sans erreur dans le Studio MyPuls de la modèle — script créé DÉSACTIVÉ. */
export async function sendImport(raw: unknown): Promise<ActionResult<{ mypulsScriptId: number; mediaNote: string }>> {
  return runAction({
    schema: z.object({ importId: z.uuid() }),
    input: raw,
    guard: noGuard,
    handler: async ({ importId }) => {
      const profile = await requireImporter()
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('script_imports')
        .select('id, created_by, status, errors, draft, created_at, sent_at, mypuls_script_id, notion_title, creators:creator_id (mypuls_creator_id, name)')
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

      // Un seul envoi à la fois : tous partagent la session MyPuls « scripts » (cf. withSendLock, 0187).
      return withSendLock(sendLock(), importId, async () => {
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
          // Titre Notion relu : la collection des médias porte le nom du script tel qu'écrit dans Notion.
          result = await sendScript(writer, mypulsId, draft, undefined, { scriptTitle: row.notion_title })
        } catch (e) {
          // Session absente ou expirée : issue attendue, dite au manager. Le reste est technique : la
          // ligne garde un texte générique et l'erreur remonte (Sentry + message générique de runAction).
          const expected = e instanceof ScriptsSessionError
          await finish({ status: 'failed', failed_step: 'session MyPuls', error: expected ? e.message : TECHNICAL }).catch(
            (err: unknown) => Sentry.captureException(err),
          )
          revalidatePath(PAGE)
          if (expected) throw new BusinessError(`Envoi impossible : ${e.message}`)
          throw e
        }
        if (result.ok) {
          // Envoi RÉUSSI : une panne de la trace finale ne le transforme pas en échec affiché au manager.
          await finish({
            status: 'sent',
            mypuls_script_id: result.scriptId,
            sent_at: new Date().toISOString(),
            media_result: result.media as unknown as Json,
          }).catch(
            (e: unknown) => Sentry.captureException(e),
          )
          revalidatePath(PAGE)
          return { mypulsScriptId: result.scriptId, mediaNote: describeMedia(result.media) }
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
      })
    },
  })
}

const TECHNICAL = 'Erreur technique, signalée à l’équipe.'

/** Déconnecte UN espace Notion : le sien, ou n'importe lequel pour un admin (sa clé est supprimée du CRM ; la connexion se retire aussi dans Notion). */
export async function disconnectNotion(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.object({ connectionId: z.string().min(1) }),
    input: raw,
    guard: noGuard,
    handler: async ({ connectionId }) => {
      const profile = await requireImporter()
      const done = await deleteNotionConnection(connectionId, { id: profile.id, role: profile.role })
      if (done === 'refusé') throw new BusinessError('Tu ne peux déconnecter que tes propres espaces Notion.')
      if (done === 'absente') throw new BusinessError('Espace déjà déconnecté.')
      revalidatePath(PAGE)
    },
  })
}
