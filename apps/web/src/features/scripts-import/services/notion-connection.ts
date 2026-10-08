import 'server-only'
import { createAdminClient } from '@glagency/db'
import { decryptSecret, encryptSecret } from '@/lib/snap-crypto'
import { isNotionUnauthorized, refreshAccessToken, type NotionGrant } from '../oauth'

/**
 * Connexions aux espaces Notion (table `notion_connection`, 0184/0185/0188) : UNE LIGNE PAR ESPACE
 * (id = id de l'espace) — Notion délivre une clé par espace, et chaque « Connecter Notion » ajoute
 * l'espace choisi. RLS sans policy : lue et écrite par le client service role, APRÈS contrôle du rôle
 * par l'appelant (route OAuth, action admin, service de la page). Les clés sont chiffrées en base et ne
 * sortent jamais de ce module vers le navigateur.
 */
export interface NotionConnectionView {
  /** Id de l'espace Notion (= id de la ligne). */
  id: string
  workspaceName: string
  connectedAt: string
  connectedBy: string | null
}

export async function getNotionConnections(): Promise<NotionConnectionView[]> {
  const db = createAdminClient()
  // Quelques lignes au plus (une par espace) : plafond explicite, loin des 1 000 lignes de PostgREST.
  const { data, error } = await db
    .from('notion_connection')
    .select('id, workspace_name, connected_at, profiles:connected_by (display_name)')
    .order('connected_at')
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const by = r.profiles as { display_name: string | null } | null
    return { id: r.id, workspaceName: r.workspace_name, connectedAt: r.connected_at, connectedBy: by?.display_name ?? null }
  })
}

/** Ajoute l'espace, ou remplace SA connexion s'il était déjà connecté (upsert sur l'id de l'espace). */
export async function saveNotionConnection(grant: NotionGrant, profileId: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('notion_connection').upsert(
    {
      id: grant.workspaceId,
      access_token_encrypted: encryptSecret(grant.accessToken),
      refresh_token_encrypted: grant.refreshToken ? encryptSecret(grant.refreshToken) : null,
      workspace_id: grant.workspaceId,
      workspace_name: grant.workspaceName,
      bot_id: grant.botId,
      connected_by: profileId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

export async function deleteNotionConnection(id: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('notion_connection').delete().eq('id', id)
  if (error) throw new Error(error.message)
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
