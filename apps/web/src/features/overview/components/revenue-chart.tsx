'use client'

// Frontière de chargement : recharts hors du bundle serveur (worker Cloudflare, limite 3 MiB
// Free) via `ssr: false`. Implémentation dans revenue-chart.client.tsx. Fallback même hauteur.
import dynamic from 'next/dynamic'

export const RevenueChart = dynamic(
  () => import('./revenue-chart.client').then((m) => m.RevenueChart),
  {
    ssr: false,
    loading: () => <div className="h-[400px] w-full animate-pulse rounded-xl border bg-muted/20" />,
  },
)
