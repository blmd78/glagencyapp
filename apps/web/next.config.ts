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

// withSentryConfig absent volontairement : le Sentry CLIENT (erreurs navigateur) est
// chargé paresseusement via instrumentation-client.ts ; le Sentry SERVEUR reste à
// brancher (@sentry/nextjs serveur redevient possible maintenant que la cible est
// Vercel — la contrainte de taille venait du plan Workers Free).
export default nextConfig
