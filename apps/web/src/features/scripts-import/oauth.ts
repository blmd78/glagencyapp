import { timingSafeEqual } from 'node:crypto'

/**
 * OAuth du Notion de l'agence (doc officielle « Authorization », relue le 2026-10-07) — fonctions
 * pures, testées ; les Route Handlers `api/notion/*` ne font que les brancher. Seul un admin réel
 * connecte (contrôlé dans les routes). Notion renvoie aussi un `refresh_token` : la clé peut expirer,
 * on la renouvelle sur un 401 (services/notion-connection.ts).
 */
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token'

export function notionAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL('https://api.notion.com/v1/oauth/authorize')
  u.searchParams.set('client_id', o.clientId)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('owner', 'user')
  u.searchParams.set('redirect_uri', o.redirectUri)
  u.searchParams.set('state', o.state)
  return u.toString()
}

/** Le `state` du retour doit être celui posé en cookie au départ (anti-CSRF), comparé à temps constant. */
export function checkState(cookieState: string | undefined, queryState: string | null): boolean {
  if (!cookieState || !queryState) return false
  const a = Buffer.from(cookieState)
  const b = Buffer.from(queryState)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Clé refusée par Notion (401) — message posé par `@glagency/scripts` (« Notion 401 sur /v1/… »). */
export function isNotionUnauthorized(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Notion 401 ')
}

export type NotionGrant = {
  accessToken: string
  refreshToken: string | null
  workspaceId: string
  workspaceName: string
  botId: string
}

async function tokenRequest(fetchFn: typeof fetch, clientId: string, clientSecret: string, body: Record<string, string>): Promise<NotionGrant> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Notion a refusé la connexion (${res.status})`)
  const j = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    workspace_id?: string
    workspace_name?: string
    bot_id?: string
  }
  if (!j.access_token || !j.workspace_id || !j.bot_id) throw new Error('Notion : réponse de connexion incomplète')
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    workspaceId: j.workspace_id,
    workspaceName: j.workspace_name ?? '',
    botId: j.bot_id,
  }
}

export function exchangeCode(
  fetchFn: typeof fetch,
  o: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<NotionGrant> {
  return tokenRequest(fetchFn, o.clientId, o.clientSecret, { grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri })
}

export function refreshAccessToken(
  fetchFn: typeof fetch,
  o: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<NotionGrant> {
  return tokenRequest(fetchFn, o.clientId, o.clientSecret, { grant_type: 'refresh_token', refresh_token: o.refreshToken })
}
