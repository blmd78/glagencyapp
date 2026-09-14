'use client'

// Frontière de chargement : recharts hors du bundle critique — même raison que
// `marketing-dashboard/mkt-daily-chart`, où l'import statique embarquait une SECONDE copie
// (~368 Ko) en plus du chunk dynamique déjà partagé par les autres graphes.
//
// UN seul wrapper pour les deux chemins (modale du classement, mode Graphique) : deux
// `dynamic()` sur le même module, c'est deux points d'entrée à garder synchrones pour rien.
import dynamic from 'next/dynamic'

export const LinkDailyChart = dynamic(
  () => import('./link-daily-chart.client').then((m) => m.LinkDailyChart),
  {
    ssr: false,
    loading: () => <div className="h-[260px] w-full animate-pulse rounded-xl border bg-muted/20" />,
  },
)
