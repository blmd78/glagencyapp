import type { WheelSector } from '@glagency/core'
import { cn } from '@/lib/utils'

/**
 * La roue, en SVG pur — AUCUNE lib, AUCUN hook : le composant sert aussi bien dans un Server
 * Component (aperçu admin / encadrant) que dans le client (`wheel-spinner`). Géométrie reprise de
 * GLA (`drawWheel`) : viewBox 200×200, rayon 98, **0° = le haut** (là où pointe le triangle),
 * angles croissants dans le sens horaire.
 *
 * DA de l'app, pas celle de GLA (demandes du 2026-08-19/20) : sobre mais « dopamine » — gagner =
 * VERT (la couleur de l'argent dans l'app), en deux tons alternés ; perdre = `destructive`. Le
 * reste sur les tokens du thème : séparateurs couleur de fond, pointeur et moyeu `foreground`,
 * libellés blancs (lisibles sur les deux verts et le rouge, light comme dark). Les verts viennent
 * de la palette Tailwind v4 (`--color-emerald-*`, émise par `@import "tailwindcss"`).
 */

/** Deux tons pour les secteurs gagnants, alternés par POSITION parmi les gagnants (pas par index). */
const WIN_TONES = ['var(--color-emerald-500)', 'var(--color-emerald-600)']
const LOSE_TONE = 'var(--destructive)'
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

/**
 * Un secteur fin ne peut pas porter un gros libellé — et sous 7° il n'en porte aucun. Le libellé
 * étant RADIAL (il court le long du rayon), c'est sa HAUTEUR qui doit tenir dans l'ouverture du
 * secteur : à 0,58 R l'arc mesure ≈ 1 px par degré, d'où le plafond à 9 px.
 */
const fontSize = (span: number) => (span < 20 ? 8 : 9)

/** Rayon où se pose le libellé : assez rentré pour qu'un libellé long ne déborde pas de la jante. */
const LABEL_R = 0.58

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
        <path d="M12 20 L0 0 H24 Z" fill="var(--foreground)" />
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
        {angles.map(({ index, a0, a1 }, i) => {
          const s = sectors[index]
          if (!s) return null
          const span = a1 - a0
          const mid = (a0 + a1) / 2
          const [x0, y0] = polar(R, a0)
          const [x1, y1] = polar(R, a1)
          const [lx, ly] = polar(R * LABEL_R, mid)
          // Alternance comptée sur les gagnants dessinés AVANT celui-ci : deux gagnants voisins
          // n'ont jamais le même ton, même de part et d'autre d'un secteur perdant.
          const winsBefore = angles.slice(0, i).filter((a) => !sectors[a.index]?.lose).length
          const fill = s.lose ? LOSE_TONE : WIN_TONES[winsBefore % WIN_TONES.length]
          // Libellé RADIAL (il court du moyeu vers la jante) et non tangentiel : un texte tangentiel
          // se retrouve tête en bas dès que le secteur passe sous l'horizontale.
          // `rotate()` en SVG tourne dans le sens horaire (y vers le bas) et `polar` pose le point à
          // l'angle standard `mid − 90` : c'est exactement l'inclinaison à donner au texte.
          // Il devient tête en bas quand la direction de lecture part vers la gauche, soit
          // cos(mid − 90) < 0, soit `mid` dans (180°, 360°) → on le retourne de 180° (`mid + 90`).
          // Config par défaut : « Cadeau » (mid 144°, bas-droite) reste normal ; « Raté » (mid 324°,
          // haut-gauche) est retourné. Les deux se lisent.
          const tilt = mid > 180 ? mid + 90 : mid - 90
          return (
            <g key={index}>
              {single ? (
                <circle cx={CX} cy={CY} r={R} fill={fill} />
              ) : (
                <path
                  d={`M${CX},${CY} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${span > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`}
                  fill={fill}
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              )}
              {span > 7 && (
                <text
                  x={lx.toFixed(2)}
                  y={ly.toFixed(2)}
                  fill="#fff"
                  fontSize={fontSize(span)}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${tilt.toFixed(1)},${lx.toFixed(2)},${ly.toFixed(2)})`}
                  style={{ pointerEvents: 'none' }}
                >
                  {s.label.slice(0, 16)}
                </text>
              )}
            </g>
          )
        })}
        {/* Moyeu : masque la pointe des secteurs au centre. */}
        <circle cx={CX} cy={CY} r={14} fill="var(--background)" stroke="var(--foreground)" strokeWidth={2} />
      </svg>
    </div>
  )
}
