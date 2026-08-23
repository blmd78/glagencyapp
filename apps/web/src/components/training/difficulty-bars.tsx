import { cn } from '@/lib/utils'

/** Cinq barres pour une échelle 1-10 (une par cran de 2), de hauteur croissante. */
const HEIGHTS = [5, 6.5, 8, 9.5, 11]

/**
 * Difficulté d'un cas en « barres de signal » — reprise de `lvlSignal` de l'app Good Luck Agency :
 * on lit la difficulté d'un coup d'œil au lieu de déchiffrer « diff. 7/10 » au milieu d'une ligne
 * de métadonnées.
 *
 * Pas de primitive shadcn pour ça (ce n'est ni un `Progress` — la valeur n'est pas un
 * pourcentage —, ni un `Badge`) : cinq `<div>` et les couleurs pleines de la palette Tailwind du
 * repo. Les paires de `STATUS_COLORS` ne conviennent pas ici, elles sont faites pour un fond + un
 * texte de badge, pas pour des traits de 3 px.
 *
 * Accessible : la couleur n'est jamais la seule information — le nombre de barres remplies la
 * porte aussi, et la valeur exacte est annoncée aux lecteurs d'écran.
 */
export function DifficultyBars({ difficulty, className }: { difficulty: number; className?: string }) {
  const value = Math.min(10, Math.max(1, Math.round(difficulty)))
  const filled = Math.ceil(value / 2)
  const color = value <= 4 ? 'bg-green-600' : value <= 7 ? 'bg-amber-500' : 'bg-red-600'
  return (
    <span className={cn('inline-flex items-end gap-0.5', className)} title={`Difficulté ${value}/10`}>
      {HEIGHTS.map((h, i) => (
        <span
          key={h}
          aria-hidden
          style={{ height: `${h}px` }}
          className={cn('w-[3px] rounded-[1px]', i < filled ? color : 'bg-muted-foreground/25')}
        />
      ))}
      <span className="sr-only">Difficulté {value} sur 10</span>
    </span>
  )
}
