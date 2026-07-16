import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cache Components (norme Next 16 / 2026) : PPR par défaut — coquille statique
  // pré-rendue (2,9 Ko, zéro donnée utilisateur) + contenu dynamique streamé sous
  // Suspense. Remplace experimental.staleTimes : les entrées full-préfetchées du sweep
  // sidebar restent fraîches ~300 s (défaut interne staleTimes.static de Next).
  // ⚠️ Non supporté par l'adaptateur OpenNext Cloudflare : depuis ce commit, la SEULE
  // cible de déploiement est Vercel (deploy auto à chaque push sur main).
  cacheComponents: true,
  // React Compiler (stable Next 16) : mémoïsation AUTOMATIQUE à la compilation —
  // useMemo/useCallback/React.memo insérés par analyse du code, plus besoin de les
  // poser à la main (la classe de bugs « tout le tableau re-rend » disparaît à la racine).
  reactCompiler: true,
  // Packages workspace consommés en TS source → transpilés par Next.
  transpilePackages: ['@glagency/core', '@glagency/db'],
}

// Sentry build plugin : upload des sourcemaps (Debug IDs natifs Turbopack, Next ≥ 15.6).
// Sans SENTRY_AUTH_TOKEN (dev local), le plugin ne fait rien — safe par défaut.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
})
