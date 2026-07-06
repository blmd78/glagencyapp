import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages workspace consommés en TS source → transpilés par Next.
  transpilePackages: ['@glagency/core', '@glagency/db'],
}

// withSentryConfig retiré volontairement : il ré-instrumente les fonctions serveur et tire
// `@sentry/node` + OpenTelemetry dans le worker (~528 KiB gzip), ce qui dépassait la limite
// 3 MiB des Workers en plan FREE (deploy refusé, code 10027). Le Sentry CLIENT (erreurs
// navigateur) reste actif via `instrumentation-client.ts` (chargé nativement par Next, il
// vit dans les assets statiques, hors budget worker). Le Sentry SERVEUR (RSC / Server
// Actions / Route Handlers) est désactivé — à réactiver via `@sentry/cloudflare` (SDK Workers)
// quand on voudra le retour des erreurs serveur sans crever la limite de taille.
export default nextConfig

// Déploiement Cloudflare Workers via OpenNext : active le binding runtime en `next dev`
// (getCloudflareContext) — sans effet sur le build de prod. Cf. wrangler.jsonc + open-next.config.ts.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
initOpenNextCloudflareForDev()
