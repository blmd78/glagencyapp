import { cn } from '@/lib/utils'

/** Cinq barres de hauteur croissante — la silhouette monte, comme des barres de signal. */
const HEIGHTS = [5, 6.5, 8, 9.5, 11]

/**
 * Le niveau d'un cas en « barres de signal » — reprise de `lvlSignal` de l'app Good Luck Agency :
 * on lit d'un coup d'œil où l'on en est dans la montée en difficulté d'un module, au lieu de
 * déchiffrer « diff. 7/10 » au milieu d'une ligne de métadonnées.
 *
 * DEUX MODES, parce que la source du niveau change selon l'écran :
 *  - `index`/`total` (mode GLA) : la POSITION dans la liste triée par difficulté. C'est ce que fait
 *    l'original — le 1er cas d'un module montre une barre, le dernier les cinq, quelle que soit sa
 *    difficulté absolue. C'est la progression DANS le module qui parle.
 *  - `difficulty` seule : l'échelle 1-10 du catalogue, quand il n'y a pas de liste (fiche d'un cas).
 *
 * Cinq barres et pas une par cas (GLA en met `total`) : un module de 22 cas donnerait 22 traits de
 * 3 px, illisibles. Le gradient vert → rouge, lui, est repris tel quel.
 *
 * Accessible : la couleur n'est jamais la seule information — le nombre de barres remplies la porte
 * aussi, et le niveau est annoncé aux lecteurs d'écran.
 */
export function DifficultyBars({
  difficulty,
  index,
  total,
  className,
}: {
  difficulty: number
  /** Position (0-based) dans la liste triée par difficulté — active le mode GLA. */
  index?: number
  /** Taille de cette liste. */
  total?: number
  className?: string
}) {
  const gla = index != null && total != null && total > 0
  // Part de progression dans [0, 1] : la position dans le module, ou la difficulté sur 10.
  const ratio = gla ? (total > 1 ? index / (total - 1) : 0) : Math.min(10, Math.max(1, difficulty)) / 10
  const filled = Math.max(1, Math.ceil(ratio * HEIGHTS.length))
  // Teinte GLA : 140 (vert) → 0 (rouge), et la barre s'assombrit en montant.
  const hue = Math.round(140 * (1 - ratio))
  const light = Math.round(50 - ratio * 14)
  const label = gla ? `Niveau ${index + 1} sur ${total}` : `Difficulté ${Math.round(difficulty)} sur 10`

  return (
    <span className={cn('inline-flex h-4 min-w-6 flex-none items-end gap-0.5', className)} title={label}>
      {HEIGHTS.map((h, i) => (
        <span
          key={h}
          aria-hidden
          style={{
            height: `${h}px`,
            background: i < filled ? `hsl(${hue}, 70%, ${light}%)` : 'var(--gla-surface3, hsl(0 0% 50% / 0.25))',
          }}
          className="w-[3px] rounded-[1px]"
        />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  )
}
