import type { WheelSector } from '@glagency/core'
import { cn } from '@/lib/utils'

/**
 * La roue, en SVG pur — AUCUNE lib, AUCUN hook : le composant sert aussi bien dans un Server
 * Component (aperçu admin / encadrant) que dans le client (`wheel-spinner`). Géométrie reprise de
 * GLA (`drawWheel`) : viewBox 200×200, rayon 98, **0° = le haut** (là où pointe le triangle),
 * angles croissants dans le sens horaire.
 *
 * C'est le SEUL endroit de la feature où des couleurs en dur sont admises (décision du plan : la
 * roue est colorée, tout le reste de la page suit la DA sobre).
 */

/** Palette GLA (secteur gagnant), cyclée ; un secteur perdant est toujours rouge. */
const COLORS = ['#8b5cf6', '#13C57A', '#19d3a2', '#a855f7', '#ffb547', '#6366f1', '#2dd4bf', '#f472b6']
const LOSE_COLOR = '#ff5d7c'
const R = 98
const CX = 100
const CY = 100

export interface SectorAngle {
  /** Index dans le tableau `sectors` D'ORIGINE — c'est `SpinResult.sectorIndex` côté serveur. */
  index: number
  /** Bornes en degrés depuis le haut, sens horaire. */
  a0: number
  a1: number
}

/**
 * Découpe la roue : un arc par secteur, proportionnel à son poids. Les poids nuls ne sont PAS
 * dessinés (un secteur d'angle 0 est invisible et fausserait la recherche du secteur tiré) —
 * d'où `index`, qui garde le lien avec le tableau d'origine. Somme nulle → aucun secteur (le
 * serveur, lui, refuse déjà cette config : `pickWeighted` throw).
 */
export function sectorAngles(sectors: WheelSector[]): SectorAngle[] {
  const total = sectors.reduce((n, s) => n + Math.max(0, s.weight), 0)
  if (total <= 0) return []
  const out: SectorAngle[] = []
  let a0 = 0
  sectors.forEach((s, index) => {
    const w = Math.max(0, s.weight)
    if (w === 0) return
    const a1 = a0 + (w / total) * 360
    out.push({ index, a0, a1 })
    a0 = a1
  })
  return out
}

/** Point du cercle à `deg` degrés depuis le haut (d'où le −90 : 0 rad pointe à droite en SVG). */
const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

/** Un secteur fin ne peut pas porter un gros libellé — et sous 7° il n'en porte aucun. */
const fontSize = (span: number) => (span < 20 ? 7 : span < 40 ? 9 : 12)

export function WheelSvg({
  sectors,
  rotation = 0,
  spinning = false,
  className,
}: {
  sectors: WheelSector[]
  /** Rotation courante en degrés (cumulative : elle ne redescend jamais). */
  rotation?: number
  /** Anime la transition vers `rotation` (4,8 s, la durée que le spinner attend). */
  spinning?: boolean
  className?: string
}) {
  const angles = sectorAngles(sectors)
  // Secteur unique : l'arc dégénère (départ == arrivée, le navigateur ne dessine rien) → disque.
  const single = angles.length === 1
  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[340px]', className)}>
      {/* Pointeur FIXE, hors du <svg> qui tourne : c'est lui qui désigne le secteur à 0°. */}
      <svg aria-hidden="true" viewBox="0 0 24 20" className="absolute -top-1 left-1/2 z-10 w-6 -translate-x-1/2">
        <path d="M12 20 L0 0 H24 Z" fill="#ffb547" />
      </svg>
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`Roue des récompenses : ${sectors.map((s) => s.label).join(', ')}`}
        className="size-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 4.8s cubic-bezier(.15,.75,.2,1)' : 'none',
        }}
      >
        {angles.map(({ index, a0, a1 }) => {
          const s = sectors[index]
          if (!s) return null
          const span = a1 - a0
          const mid = (a0 + a1) / 2
          const [x0, y0] = polar(R, a0)
          const [x1, y1] = polar(R, a1)
          const [lx, ly] = polar(R * 0.6, mid)
          const fill = s.lose ? LOSE_COLOR : COLORS[index % COLORS.length]
          return (
            <g key={index}>
              {single ? (
                <circle cx={CX} cy={CY} r={R} fill={fill} stroke="#0e1016" strokeWidth={1.5} />
              ) : (
                <path
                  d={`M${CX},${CY} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${span > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`}
                  fill={fill}
                  stroke="#0e1016"
                  strokeWidth={1.5}
                />
              )}
              {span > 7 && (
                <text
                  x={lx.toFixed(2)}
                  y={ly.toFixed(2)}
                  fill="#fff"
                  fontSize={fontSize(span)}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${mid.toFixed(1)},${lx.toFixed(2)},${ly.toFixed(2)})`}
                  style={{ pointerEvents: 'none' }}
                >
                  {s.label.slice(0, 16)}
                </text>
              )}
            </g>
          )
        })}
        {/* Moyeu : masque la pointe des secteurs au centre. */}
        <circle cx={CX} cy={CY} r={15} fill="#0e1016" stroke="#8b5cf6" strokeWidth={4} />
      </svg>
    </div>
  )
}
