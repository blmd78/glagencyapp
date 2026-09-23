'use client'

// Frontière de chargement : recharts hors du bundle critique (même pattern que
// overview/revenue-chart) — un import statique embarquerait une DEUXIÈME copie de recharts
// (~368 Ko) en plus du chunk dynamique partagé par les autres graphes. Fallback même hauteur.
import dynamic from 'next/dynamic'

export const MetricDailyChart = dynamic(
  () => import('./metric-daily-chart.client').then((m) => m.MetricDailyChart),
  {
    ssr: false,
    loading: () => <div className="h-[280px] w-full animate-pulse rounded-xl border bg-muted/20" />,
  },
)
