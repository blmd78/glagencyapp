'use client'

// Frontière de chargement : recharts (lourd, ~visuel only) ne doit PAS être bundlé côté
// serveur (worker Cloudflare, limite 3 MiB Free). `ssr: false` le sort du bundle serveur —
// il n'est chargé que côté client. Fallback de même hauteur → pas de layout shift.
// L'implémentation recharts vit dans subs-chart.client.tsx.
import dynamic from 'next/dynamic'

export const SubsChart = dynamic(() => import('./subs-chart.client').then((m) => m.SubsChart), {
  ssr: false,
  loading: () => <div className="h-[452px] w-full animate-pulse rounded-xl border bg-muted/20" />,
})
