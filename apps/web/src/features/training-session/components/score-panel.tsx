import { Progress } from '@/components/ui/progress'
import { scoreColor } from '@/lib/training/score-color'
import { cn } from '@/lib/utils'
import type { ThreadScore } from '../types'

/**
 * « Note par critère » (GLA) : une barre par axe, colorée au feu tricolore.
 *
 * Le COMMENTAIRE du correcteur et les MOMENTS marquants n'y sont plus : le premier a sa propre
 * carte « Débrief du coach », les seconds sont collés aux messages qui les ont provoqués
 * (`AnnotatedTranscript`). C'est le découpage de `render.trainResult`, et il vaut mieux que notre
 * bloc unique : une remarque perdue au milieu des barres ne se lit pas.
 *
 * Chaque axe est coloré au MÊME feu tricolore que la jauge de note (`scoreColor`) : sur un écran
 * de résultat, on doit voir en un coup d'œil QUEL critère a coûté les points, sans lire les
 * chiffres un par un. Le chiffre reste affiché à côté — la couleur n'est jamais seule porteuse.
 */
export function ScorePanel({
  score,
  axisMax = 25,
}: {
  score: ThreadScore
  /** 25 (solo / défi) ou 100 (boss, étape /100). */
  axisMax?: 25 | 100
}) {
  return (
    <section className="gla-cardbox p-5">
      <h3 className="mb-3 text-[15px] font-bold">Note par critère</h3>

      {score.axes.length > 0 && (
        <div className="flex flex-col gap-2">
          {score.axes.map((a) => {
            const pct = (a.score / axisMax) * 100
            const color = scoreColor(pct)
            return (
              <div key={a.key} className="flex flex-col gap-1">
                <p className="flex items-baseline justify-between text-sm">
                  <span>{a.name}</span>
                  <span className={cn('font-semibold tabular-nums', color.text)}>
                    {a.score}/{axisMax}
                  </span>
                </p>
                <Progress value={pct} indicatorClassName={color.bg} label={`${a.name} : ${a.score} sur ${axisMax}`} />
              </div>
            )
          })}
        </div>
      )}

    </section>
  )
}
