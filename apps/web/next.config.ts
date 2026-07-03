import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages workspace consommés en TS source → transpilés par Next.
  transpilePackages: ['@glagency/core', '@glagency/db'],
}

// Sans SENTRY_AUTH_TOKEN (env de build locale, jamais commitée), l'upload des source maps
// est simplement sauté — le build reste fonctionnel. Seules les stack traces CLIENT se
// démanglent : celles du bundle serveur re-bundlé par OpenNext ne se résolvent pas à ce
// jour (issue getsentry/sentry-javascript#19213).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: true,
})

// Déploiement Cloudflare Workers via OpenNext : active le binding runtime en `next dev`
// (getCloudflareContext) — sans effet sur le build de prod. Cf. wrangler.jsonc + open-next.config.ts.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
initOpenNextCloudflareForDev()
