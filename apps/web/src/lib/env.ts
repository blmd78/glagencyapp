import { z } from 'zod'

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

let cached: { url: string; publishableKey: string } | null = null

/**
 * Env public validé (client + serveur). Accès STATIQUES aux NEXT_PUBLIC_* (inlinées au
 * build par Next — un accès dynamique par clé renverrait undefined côté client).
 * Env invalide → throw au premier appel : crash explicite au boot, pas d'undefined silencieux.
 */
export function getPublicEnv() {
  if (cached) return cached
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  if (!parsed.success) throw new Error(`Env public invalide :\n${z.prettifyError(parsed.error)}`)
  cached = {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }
  return cached
}
