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

/**
 * URL Postgres de l'ancienne plateforme Good Luck Agency — SERVEUR uniquement, jamais préfixée
 * `NEXT_PUBLIC_` : c'est un accès en lecture à une base de PRODUCTION TIERCE.
 *
 * Rôle attendu au bout : `gla_readonly` (aucun droit d'écriture, `select` par COLONNES sur
 * `chatters` — `pw_plain`, qui porte les 235 mots de passe en clair, en est volontairement exclu).
 * Un rôle DISTINCT est posé sur Preview : l'URL atterrit dans le `.env` de chaque poste de dev, et
 * les deux mots de passe doivent pouvoir être révoqués séparément.
 *
 * Fail-fast comme `createAdminClient` / `anthropic()` : absente, la reprise doit dire « ancienne
 * plateforme injoignable », pas partir sur une chaîne `undefined`.
 */
export function getGlaDatabaseUrl(): string {
  const raw = process.env.GLA_DATABASE_URL
  if (!raw) {
    throw new Error('GLA_DATABASE_URL manquante (cf. .env.example à la racine — à poser dans apps/web/.env.local et sur Vercel)')
  }
  return raw
}
