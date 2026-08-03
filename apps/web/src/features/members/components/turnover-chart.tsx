'use client'

// Frontière de chargement : recharts (lourd, purement visuel) n'a rien à faire dans le rendu
// serveur — il mesure le DOM au montage, son SSR ne produirait qu'un conteneur vide plus du JS
// serveur inutile. `ssr: false` le sort du bundle/rendu serveur. Fallback de même hauteur → pas
// de layout shift. Patron repris de `subs-chart.tsx` / `revenue-chart.tsx`.
// L'implémentation recharts vit dans turnover-chart.client.tsx.
import dynamic from 'next/dynamic'

export const TurnoverChart = dynamic(
  () => import('./turnover-chart.client').then((m) => m.TurnoverChart),
  {
    ssr: false,
    loading: () => <div className="h-[372px] w-full animate-pulse rounded-xl border bg-muted/20" />,
  },
)
