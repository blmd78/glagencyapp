import 'server-only'
import { matchCreatorByName, type DraftError, type DraftSummary } from '@glagency/core'
import { createAdminClient, fetchAll } from '@glagency/db'
import type { Cleanup } from '@glagency/scripts'
import { listNotionScripts, listSharedTopPages } from '@glagency/scripts'
import type { Profile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { importStatus, type ImportRow } from '../rules'
import { failureText } from '../send-rules'
import { getNotionConnection, withNotionToken, type NotionConnectionView } from './notion-connection'

export interface CreatorOption {
  id: string
  name: string
  mypulsId: string
}
export interface ScriptFolder {
  id: string
  title: string
  /** Modèle reconnue d'après le nom du dossier, dans le périmètre de l'appelant ; null = choix manuel. */
  creatorId: string | null
  scripts: Array<{ id: string; title: string }>
}
export interface ImportListItem extends ImportRow {
  notionTitle: string
  creatorName: string
  error: string | null
}
export interface ImportDetail extends ImportListItem {
  creatorId: string
  summary: DraftSummary
  notes: DraftError[]
  errors: DraftError[]
  failedStep: string | null
  cleanup: Cleanup | null
  /** Échec ou envoi interrompu : message reconstruit depuis la ligne (survit au rechargement). */
  failureMessage: string | null
}
export interface ScriptsImportData {
  connection: NotionConnectionView | null
  /** Erreur de lecture Notion (page non partagée, Notion indisponible) — la page reste utilisable. */
  notionError: string | null
  folders: ScriptFolder[]
  rootCandidates: Array<{ id: string; title: string }>
  creators: CreatorOption[]
  imports: ImportListItem[]
  current: ImportDetail | null
}

/**
 * Modèles pour lesquelles l'appelant peut importer : admin → toutes les modèles actives reliées à
 * MyPuls ; encadrant → SES modèles (`profile_creators`) — sans modèle assignée, aucune (on écrit
 * chez un tiers). Miroir applicatif de la RLS de `script_imports` (0184), qui reste le vrai verrou.
 */
export async function allowedCreators(profile: Profile): Promise<CreatorOption[]> {
  const admin = createAdminClient()
  const { data: creators, error } = await fetchAll<{ id: string; name: string; mypuls_creator_id: string | null; active: boolean }>((from, to) =>
    admin.from('creators').select('id, name, mypuls_creator_id, active').order('name').range(from, to),
  )
  if (error) throw new Error(error.message)
  const linked = creators.filter((c) => c.active && c.mypuls_creator_id)
  const toOption = (c: (typeof linked)[number]): CreatorOption => ({ id: c.id, name: c.name, mypulsId: c.mypuls_creator_id as string })
  if (profile.role === 'admin') return linked.map(toOption)
  const { data: mine, error: mineError } = await fetchAll<{ creator_id: string }>((from, to) =>
    admin.from('profile_creators').select('creator_id').eq('profile_id', profile.id).range(from, to),
  )
  if (mineError) throw new Error(mineError.message)
  const ids = new Set(mine.map((r) => r.creator_id))
  return linked.filter((c) => ids.has(c.id)).map(toOption)
}

type ImportDbRow = {
  id: string
  created_by: string
  creator_id: string
  status: ImportRow['status']
  errors: DraftError[]
  notes: DraftError[]
  summary: DraftSummary
  created_at: string
  sent_at: string | null
  mypuls_script_id: number | null
  notion_title: string
  error: string | null
  failed_step: string | null
  cleanup: Cleanup | null
  script_name: string | null
  creators: { name: string } | null
}

const toItem = (r: ImportDbRow): ImportListItem => ({
  id: r.id,
  createdBy: r.created_by,
  status: r.status,
  errorsCount: Array.isArray(r.errors) ? r.errors.length : 0,
  createdAt: r.created_at,
  sentAt: r.sent_at,
  mypulsScriptId: r.mypuls_script_id,
  notionTitle: r.notion_title,
  creatorName: r.creators?.name ?? '—',
  error: r.error,
})

const IMPORT_COLUMNS =
  'id, created_by, creator_id, status, errors, notes, summary, created_at, sent_at, mypuls_script_id, notion_title, error, failed_step, cleanup, script_name:draft->>name, creators:creator_id (name)'

export async function getScriptsImport(profile: Profile, importId?: string): Promise<ScriptsImportData> {
  const supabase = await createClient()
  const isAdmin = profile.role === 'admin'
  const [connection, creators, importsRes, currentRes] = await Promise.all([
    getNotionConnection(),
    allowedCreators(profile),
    supabase.from('script_imports').select(IMPORT_COLUMNS).order('created_at', { ascending: false }).limit(50),
    importId ? supabase.from('script_imports').select(IMPORT_COLUMNS).eq('id', importId).maybeSingle() : Promise.resolve(null),
  ])
  if (importsRes.error) throw new Error(importsRes.error.message)
  if (currentRes?.error) throw new Error(currentRes.error.message)

  let notionError: string | null = null
  let folders: ScriptFolder[] = []
  let rootCandidates: Array<{ id: string; title: string }> = []
  if (connection) {
    try {
      if (connection.rootPageId) {
        const raw = (await withNotionToken((token, root) => (root ? listNotionScripts(token, root) : Promise.resolve([])))) ?? []
        folders = raw.map((f) => {
          const m = matchCreatorByName(creators, f.title)
          return { ...f, creatorId: m.kind === 'found' ? m.row.id : null }
        })
      } else if (isAdmin) {
        rootCandidates = (await withNotionToken((token) => listSharedTopPages(token))) ?? []
      }
    } catch (e) {
      notionError = (e as Error).message
    }
  }

  const current = currentRes?.data as unknown as ImportDbRow | null | undefined
  return {
    connection,
    notionError,
    folders,
    rootCandidates,
    creators,
    imports: ((importsRes.data ?? []) as unknown as ImportDbRow[]).map(toItem),
    current: current
      ? {
          ...toItem(current),
          creatorId: current.creator_id,
          summary: current.summary,
          notes: current.notes ?? [],
          errors: current.errors ?? [],
          failedStep: current.failed_step,
          cleanup: current.cleanup,
          failureMessage: failureText({
            status: importStatus(toItem(current), new Date()),
            mypulsScriptId: current.mypuls_script_id,
            failedStep: current.failed_step,
            error: current.error,
            cleanup: current.cleanup,
            scriptName: current.script_name ?? current.notion_title,
          }),
        }
      : null,
  }
}
