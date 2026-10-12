import 'server-only'
import { createAdminClient } from '@glagency/db'
import { decryptSecret, encryptSecret } from '@/lib/snap-crypto'
import { canDisconnect, canSeeConnection, type NotionConnectionView, type Viewer } from '../connection-rules'
import { isNotionUnauthorized, refreshAccessToken, type NotionGrant } from '../oauth'

export type { NotionConnectionView, Viewer }

/**
 * Connexions aux espaces Notion (table `notion_connection`, 0184/0185/0188/0192) : UNE LIGNE PAR ESPACE
 * ET PAR PERSONNE — admins et encadrement connectent chacun leurs espaces (Notion délivre une clé par
 * espace). Visibilité (`canSeeConnection`) : un espace connecté par un admin est PARTAGÉ avec toute
 * l'équipe (le Notion d'agence) ; sinon il n'est visible que par la personne qui l'a connecté (son Notion
 * perso), admins compris. RLS sans policy : lue et écrite par le client service role, APRÈS contrôle de
 * l'appelant ; les clés sont chiffrées en base et ne sortent jamais de ce module vers le navigateur.
 */
type Row = {
  id: string
  workspace_id: string
  workspace_name: string
  connected_at: string
  connected_by: string | null
  shared: boolean
  profiles: unknown
}

/** Les connexions VISIBLES par `viewer` (`canSeeConnection`), dans l'ordre de connexion. */
export async function getNotionConnections(viewer: Viewer): Promise<NotionConnectionView[]> {
  const db = createAdminClient()
  // Quelques lignes au plus (une par espace et par personne) : plafond explicite, loin des 1 000 lignes de PostgREST.
  const { data, error } = await db
    .from('notion_connection')
    .select('id, workspace_id, workspace_name, connected_at, connected_by, shared, profiles:connected_by (display_name)')
    .order('connected_at')
    .limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[])
    .filter((r) => canSeeConnection({ shared: r.shared, connectedById: r.connected_by }, viewer))
    .map((r) => {
      const by = r.profiles as { display_name: string | null } | null
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        workspaceName: r.workspace_name,
        connectedAt: r.connected_at,
        connectedBy: by?.display_name ?? null,
        shared: r.shared,
        mine: r.connected_by === viewer.id,
        removable: canDisconnect({ connectedById: r.connected_by }, viewer),
      }
    })
}

/**
 * Ajoute l'espace pour CETTE personne, ou remplace SA connexion à cet espace (upsert sur (espace,
 * personne), 0192). Partagé avec l'équipe si un admin le connecte, privé sinon.
 */
export async function saveNotionConnection(grant: NotionGrant, viewer: Viewer): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('notion_connection').upsert(
    {
      access_token_encrypted: encryptSecret(grant.accessToken),
      refresh_token_encrypted: grant.refreshToken ? encryptSecret(grant.refreshToken) : null,
      workspace_id: grant.workspaceId,
      workspace_name: grant.workspaceName,
      bot_id: grant.botId,
      connected_by: viewer.id,
      shared: viewer.role === 'admin',
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,connected_by' },
  )
  if (error) throw new Error(error.message)
}

/** Déconnecte si `canDisconnect` : `'ok'`, `'absente'` (déjà déconnecté) ou `'refusé'` (rien n'est supprimé). */
export async function deleteNotionConnection(id: string, viewer: Viewer): Promise<'ok' | 'absente' | 'refusé'> {
  const db = createAdminClient()
  const { data, error } = await db.from('notion_connection').select('connected_by').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return 'absente'
  if (!canDisconnect({ connectedById: data.connected_by }, viewer)) return 'refusé'
  const { error: deleteError } = await db.from('notion_connection').delete().eq('id', id)
  if (deleteError) throw new Error(deleteError.message)
  return 'ok'
}

/**
 * Exécute `fn` avec la clé déchiffrée de l'espace `id` ; sur un 401, renouvelle UNE fois la clé par le
 * jeton de renouvellement (s'il existe et si l'application est configurée), l'enregistre, et rejoue `fn`.
 * Espace non connecté (ou déconnecté entre-temps) → `null`.
 */
export async function withNotionToken<T>(id: string, fn: (token: string) => Promise<T>): Promise<T | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('notion_connection')
    .select('access_token_encrypted, refresh_token_encrypted')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const token = decryptSecret(data.access_token_encrypted)
  if (!token) throw new Error('Clé Notion illisible — reconnecter cet espace.')
  try {
    return await fn(token)
  } catch (e) {
    const refresh = data.refresh_token_encrypted ? decryptSecret(data.refresh_token_encrypted) : null
    const clientId = process.env.NOTION_OAUTH_CLIENT_ID
    const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET
    if (!isNotionUnauthorized(e) || !refresh || !clientId || !clientSecret) throw e
    const grant = await refreshAccessToken(fetch, { clientId, clientSecret, refreshToken: refresh })
    const { error: saveError } = await db
      .from('notion_connection')
      .update({
        access_token_encrypted: encryptSecret(grant.accessToken),
        refresh_token_encrypted: grant.refreshToken ? encryptSecret(grant.refreshToken) : data.refresh_token_encrypted,
      })
      .eq('id', id)
    if (saveError) throw new Error(saveError.message)
    return fn(grant.accessToken)
  }
}
