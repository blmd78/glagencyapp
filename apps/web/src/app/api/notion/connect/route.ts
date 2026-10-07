import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { readStateCookie } from '@/lib/impersonation/session'
import { notionAuthorizeUrl } from '@/features/scripts-import/oauth'

/**
 * Départ de « Connecter Notion » (import de scripts) : admin RÉEL seulement (jamais « en tant que »),
 * `state` aléatoire en cookie httpOnly (anti-CSRF, relu au retour), puis redirection vers Notion.
 * Route Handler = cas OAuth prévu par archi-web.
 */
export async function GET(req: Request) {
  const back = (notion: string) => NextResponse.redirect(new URL(`/chatter/import-scripts?notion=${notion}`, req.url))
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin' || (await readStateCookie())) return back('refus')
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID
  if (!clientId) return back('config')

  const state = randomBytes(24).toString('base64url')
  const res = NextResponse.redirect(
    notionAuthorizeUrl({ clientId, redirectUri: new URL('/api/notion/callback', req.url).toString(), state }),
  )
  res.cookies.set('notion_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/notion', maxAge: 600 })
  return res
}
