import 'server-only'
import { createAdminClient } from '@glagency/db'
import { decryptSecret, encryptSecret } from '@/lib/snap-crypto'
import { isNotionUnauthorized, refreshAccessToken, type NotionGrant } from '../oauth'

/**
 * Connexion au Notion de l'agence (table `notion_connection`, 0184/0185) : RLS sans policy, donc lue et
 * écrite par le client service role — APRÈS contrôle du rôle par l'appelant (route OAuth, action admin,
 * service de la page). La clé est chiffrée en base et ne sort jamais de ce module vers le navigateur.
 */
const ID = 'agence'

export interface NotionConnectionView {
  workspaceName: string
  rootPageId: string | null
  connectedAt: string
  connectedBy: string | null
}

export async function getNotionConnection(): Promise<NotionConnectionView | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('notion_connection')
    .select('workspace_name, root_page_id, connected_at, profiles:connected_by (display_name)')
    .eq('id', ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const by = data.profiles as { display_name: string | null } | null
  return { workspaceName: data.workspace_name, rootPageId: data.root_page_id, connectedAt: data.connected_at, connectedBy: by?.display_name ?? null }
}

export async function saveNotionConnection(grant: NotionGrant, profileId: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('notion_connection').upsert(
    {
      id: ID,
      access_token_encrypted: encryptSecret(grant.accessToken),
      refresh_token_encrypted: grant.refreshToken ? encryptSecret(grant.refreshToken) : null,
      workspace_id: grant.workspaceId,
      workspace_name: grant.workspaceName,
      bot_id: grant.botId,
      root_page_id: null,
      connected_by: profileId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

export async function setNotionRootPage(pageId: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('notion_connection').update({ root_page_id: pageId }).eq('id', ID)
  if (error) throw new Error(error.message)
}

export async function deleteNotionConnection(): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('notion_connection').delete().eq('id', ID)
  if (error) throw new Error(error.message)
}

/**
 * Exécute `fn` avec la clé Notion déchiffrée ; sur un 401, renouvelle UNE fois la clé par le jeton de
 * renouvellement (s'il existe et si l'application est configurée), l'enregistre, et rejoue `fn`.
 * Sans connexion → `null` (l'appelant affiche « Notion n'est pas connecté »).
 */
export async function withNotionToken<T>(fn: (token: string, rootPageId: string | null) => Promise<T>): Promise<T | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('notion_connection')
    .select('access_token_encrypted, refresh_token_encrypted, root_page_id')
    .eq('id', ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const token = decryptSecret(data.access_token_encrypted)
  if (!token) throw new Error('Clé Notion illisible — reconnecter Notion.')
  try {
    return await fn(token, data.root_page_id)
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
      .eq('id', ID)
    if (saveError) throw new Error(saveError.message)
    return fn(grant.accessToken, data.root_page_id)
  }
}
