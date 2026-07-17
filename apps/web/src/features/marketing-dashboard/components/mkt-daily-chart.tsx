'use client'

// Frontière de chargement : recharts hors du bundle critique (même pattern que
// overview/revenue-chart) — l'import statique embarquait une DEUXIÈME copie de recharts
// (~368 Ko) en eager sur /marketing/overview, en plus du chunk dynamique partagé par les
// autres graphes. Implémentation dans mkt-daily-chart.client.tsx. Fallback même hauteur.
import dynamic from 'next/dynamic'

export const MktDailyChart = dynamic(
  () => import('./mkt-daily-chart.client').then((m) => m.MktDailyChart),
  {
    ssr: false,
    loading: () => <div className="h-[280px] w-full animate-pulse rounded-xl border bg-muted/20" />,
  },
)
