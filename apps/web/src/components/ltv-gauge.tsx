'use client'

// Frontière de chargement : recharts hors du bundle serveur (worker Cloudflare, limite 3 MiB
// Free) via `ssr: false`. Implémentation dans ltv-gauge.client.tsx. Le conteneur réserve la
// taille exacte (selon `size`) pour éviter tout layout shift pendant le chargement client.
import dynamic from 'next/dynamic'

const LtvGaugeImpl = dynamic(() => import('./ltv-gauge.client').then((m) => m.LtvGauge), {
  ssr: false,
})

export function LtvGauge(props: {
  value: number | null
  /** Repère de remplissage — la jauge sature ici, le chiffre écrit reste la vraie valeur. */
  max: number
  color: string
  caption?: string
  size?: 'lg' | 'sm'
}) {
  const lg = props.size !== 'sm'
  return (
    <div className="mx-auto" style={{ width: lg ? 180 : 96, height: lg ? 112 : 60 }}>
      <LtvGaugeImpl {...props} />
    </div>
  )
}
