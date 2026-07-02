import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages workspace consommés en TS source → transpilés par Next.
  transpilePackages: ['@glagency/core', '@glagency/db'],
}

export default nextConfig

// Déploiement Cloudflare Workers via OpenNext : active le binding runtime en `next dev`
// (getCloudflareContext) — sans effet sur le build de prod. Cf. wrangler.jsonc + open-next.config.ts.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
initOpenNextCloudflareForDev()
