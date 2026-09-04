'use client'

// Frontière de chargement : recharts hors du bundle serveur via `ssr: false`. Implémentation
// dans minute-chart.client.tsx. Le fallback fait la MÊME hauteur, sinon la page saute.
import dynamic from 'next/dynamic'

export const MinuteChart = dynamic(
  () => import('./minute-chart.client').then((m) => m.MinuteChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl border bg-muted/20" />,
  },
)
