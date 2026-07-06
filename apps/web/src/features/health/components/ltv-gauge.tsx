'use client'

// Frontière de chargement : recharts hors du bundle serveur (worker Cloudflare, limite 3 MiB
// Free) via `ssr: false`. Implémentation dans ltv-gauge.client.tsx. Le conteneur réserve la
// taille exacte (selon `size`) pour éviter tout layout shift pendant le chargement client.
import dynamic from 'next/dynamic'
import type { LtvStatus } from '../types'

const LtvGaugeImpl = dynamic(() => import('./ltv-gauge.client').then((m) => m.LtvGauge), {
  ssr: false,
})

export function LtvGauge(props: {
  ltv: number | null
  status: LtvStatus | null
  target: number
  size?: 'lg' | 'sm'
}) {
  const lg = props.size !== 'sm'
  return (
    <div className="mx-auto" style={{ width: lg ? 180 : 96, height: lg ? 112 : 60 }}>
      <LtvGaugeImpl {...props} />
    </div>
  )
}
