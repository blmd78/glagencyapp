import { cache } from 'react'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@glagency/db'

/**
 * Client Supabase serveur (RSC + Server Actions) — lié à la session (cookies).
 * La RLS s'applique selon l'utilisateur connecté.
 * `cache()` : UN client par requête serveur (pattern @supabase/ssr en RSC) — chaque
 * service en instanciait un complet (GoTrueClient + PostgREST + câblage cookies), 4-5
 * fois par rendu. CPU pur économisé, aucun changement de comportement.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Appelé depuis un Server Component : le refresh de session est géré
            // par le middleware. On peut ignorer ici.
          }
        },
      },
    },
  )
})
