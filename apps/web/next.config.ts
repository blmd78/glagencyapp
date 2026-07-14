import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages workspace consommés en TS source → transpilés par Next.
  transpilePackages: ['@glagency/core', '@glagency/db'],
  experimental: {
    // Cache client du router : re-naviguer vers une page visitée il y a < 300 s la sert
    // depuis le cache du navigateur (0 aller-retour serveur → instantané). Acceptable :
    // les données changent la nuit (ingestion), les Server Actions revalidatePath (une
    // mutation invalide immédiatement), et spenders a son auto-refresh 3 min. 300 s (et
    // non 60) : le sweep de préchargement de la sidebar cycle en ~250 s — chaque entrée
    // est re-préchargée AVANT d'expirer, avec ~80 % de rendus serveur de fond en moins.
    staleTimes: { dynamic: 300 },
  },
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
