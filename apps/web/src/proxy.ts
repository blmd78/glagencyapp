import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Convention Next 16 : proxy.ts (remplace middleware.ts, déprécié — le rename était bloqué
// par l'adaptateur OpenNext/Cloudflare, contrainte levée depuis le passage Vercel-only).
// Rôle : refresh de la session Supabase (cookies) + check OPTIMISTE (redirige si pas
// de session). L'autorisation réelle (par modèle) reste portée par la RLS côté base.
export async function proxy(request: NextRequest) {
  // Routes machine-à-machine (keep-alive, webhook de revalidation) : pas de session.
  if (['/api/ping', '/api/revalidate'].includes(request.nextUrl.pathname)) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() : valide le JWT LOCALEMENT (clés ES256 du projet, JWKS mis en cache) au
  // lieu d'un aller-retour HTTP vers Supabase Auth à CHAQUE requête (ce que fait getUser).
  // Le refresh de session reste géré par @supabase/ssr (setAll ci-dessus) à l'expiration.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ?? null

  const { pathname } = request.nextUrl
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth')
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
