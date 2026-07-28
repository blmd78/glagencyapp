'use client'

// Frontière de chargement : recharts (lourd, purement visuel) n'a rien à faire dans le rendu
// serveur — il mesure le DOM au montage, son SSR ne produirait qu'un conteneur vide plus du
// JS serveur inutile. `ssr: false` le sort du bundle/rendu serveur ; il n'est chargé que côté
// client. Fallback de même hauteur → pas de layout shift.
// L'implémentation recharts vit dans subs-chart.client.tsx.
import dynamic from 'next/dynamic'

export const SubsChart = dynamic(() => import('./subs-chart.client').then((m) => m.SubsChart), {
  ssr: false,
  loading: () => <div className="h-[452px] w-full animate-pulse rounded-xl border bg-muted/20" />,
})
