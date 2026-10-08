import { describe, expect, it } from 'vitest'
import { NotionError } from '@glagency/scripts/notion'
import { checkState, exchangeCode, isNotionUnauthorized, notionAuthorizeUrl, refreshAccessToken } from './oauth'

describe('notionAuthorizeUrl', () => {
  it('construit l’URL d’autorisation Notion (doc « Authorization », relue le 2026-10-07)', () => {
    const u = new URL(notionAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://crm.test/api/notion/callback', state: 's1' }))
    expect(u.origin + u.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      owner: 'user',
      redirect_uri: 'https://crm.test/api/notion/callback',
      state: 's1',
    })
  })
})

describe('checkState', () => {
  it('refuse un state absent, vide ou différent du cookie', () => {
    expect(checkState('abc', 'abc')).toBe(true)
    expect(checkState(undefined, 'abc')).toBe(false)
    expect(checkState('abc', null)).toBe(false)
    expect(checkState('', '')).toBe(false)
    expect(checkState('abc', 'abd')).toBe(false)
  })
})

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const GRANT = { access_token: 'secret_x', refresh_token: 'refresh_y', workspace_id: 'w1', workspace_name: 'Agence', bot_id: 'b1' }

describe('exchangeCode', () => {
  it('échange le code (Basic auth, JSON) et lit la réponse, jeton de renouvellement compris', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return ok(GRANT)
    }) as typeof fetch
    expect(await exchangeCode(fake, { clientId: 'cid', clientSecret: 'cs', code: 'c1', redirectUri: 'https://crm.test/api/notion/callback' })).toEqual({
      accessToken: 'secret_x',
      refreshToken: 'refresh_y',
      workspaceId: 'w1',
      workspaceName: 'Agence',
      botId: 'b1',
    })
    expect(seen[0]!.url).toBe('https://api.notion.com/v1/oauth/token')
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('cid:cs').toString('base64')}`)
    expect(JSON.parse(seen[0]!.init.body as string)).toEqual({
      grant_type: 'authorization_code',
      code: 'c1',
      redirect_uri: 'https://crm.test/api/notion/callback',
    })
  })
  it('sans jeton de renouvellement dans la réponse → refreshToken null', async () => {
    const fake = (async () => ok({ ...GRANT, refresh_token: undefined })) as typeof fetch
    expect((await exchangeCode(fake, { clientId: 'c', clientSecret: 's', code: 'x', redirectUri: 'r' })).refreshToken).toBeNull()
  })
  it('refus Notion → erreur sans la clé', async () => {
    const fake = (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as typeof fetch
    await expect(exchangeCode(fake, { clientId: 'cid', clientSecret: 'cs', code: 'x', redirectUri: 'r' })).rejects.toThrow(
      'Notion a refusé la connexion (400)',
    )
  })
})

describe('isNotionUnauthorized', () => {
  it('reconnaît une clé refusée par Notion (statut 401 de NotionError), jamais d’après le texte', () => {
    expect(isNotionUnauthorized(new NotionError(401, 'peu importe'))).toBe(true)
    expect(isNotionUnauthorized(new NotionError(404, 'Notion 401 dans le texte ne compte pas'))).toBe(false)
    expect(isNotionUnauthorized(new Error('Notion 401 sur /v1/search'))).toBe(false)
    expect(isNotionUnauthorized('Notion 401')).toBe(false)
  })
})

describe('refreshAccessToken', () => {
  it('renouvelle la clé (grant_type refresh_token, même authentification)', async () => {
    const seen: RequestInit[] = []
    const fake = (async (_url: string, init: RequestInit) => {
      seen.push(init)
      return ok({ ...GRANT, access_token: 'secret_z', refresh_token: 'refresh_w' })
    }) as typeof fetch
    expect(await refreshAccessToken(fake, { clientId: 'cid', clientSecret: 'cs', refreshToken: 'refresh_y' })).toMatchObject({
      accessToken: 'secret_z',
      refreshToken: 'refresh_w',
    })
    expect(JSON.parse(seen[0]!.body as string)).toEqual({ grant_type: 'refresh_token', refresh_token: 'refresh_y' })
  })
})
