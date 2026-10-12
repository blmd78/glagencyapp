import * as Sentry from '@sentry/nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getProfile, isAdminOrManager } from '@/lib/auth'
import { readStateCookie } from '@/lib/impersonation/session'
import { checkState, exchangeCode } from '@/features/scripts-import/oauth'
import { saveNotionConnection } from '@/features/scripts-import/services/notion-connection'

/**
 * Retour de Notion après « Connecter Notion » : mêmes contrôles qu'au départ (admin ou encadrant réel),
 * `state` relu et consommé, échange du code contre la clé de l'espace choisi, clé chiffrée enregistrée —
 * un espace de plus pour cette personne, ou SA connexion à cet espace remplacée (0192) ; partagé avec
 * l'équipe si un admin le connecte, privé sinon. Ses pages partagées s'affichent aussitôt.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const back = (notion: string) => {
    const res = NextResponse.redirect(new URL(`/chatter/import-scripts?notion=${notion}`, req.url))
    res.cookies.delete({ name: 'notion_oauth_state', path: '/api/notion' })
    return res
  }
  const profile = await getProfile()
  if (!profile || !isAdminOrManager(profile) || (await readStateCookie())) return back('refus')
  const jar = await cookies()
  if (!checkState(jar.get('notion_oauth_state')?.value, url.searchParams.get('state'))) return back('refus')
  if (url.searchParams.get('error')) return back('annule')
  const code = url.searchParams.get('code')
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET
  if (!code) return back('refus')
  if (!clientId || !clientSecret) return back('config')

  try {
    const grant = await exchangeCode(fetch, { clientId, clientSecret, code, redirectUri: new URL('/api/notion/callback', req.url).toString() })
    // Partagé avec l'équipe si un admin connecte, privé sinon (0192).
    await saveNotionConnection(grant, { id: profile.id, role: profile.role })
    return back('connecte')
  } catch (e) {
    Sentry.captureException(e)
    return back('erreur')
  }
}
