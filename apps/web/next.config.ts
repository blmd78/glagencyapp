import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages workspace consommés en TS source → transpilés par Next.
  transpilePackages: ['@glagency/core', '@glagency/db'],
}

export default nextConfig
