import { medalFor } from '@glagency/core'
import { AnimatedNumber } from '@/components/animated-number'
import { scoreColor } from '@/lib/training/score-color'
import { cn } from '@/lib/utils'

const R = 68
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * La note en jauge circulaire qui se dessine, avec le chiffre qui monte — reprise de l'écran de
 * résultat de l'app Good Luck Agency (`gaugeArc` + `animateCount`). C'est le moment où le chatter
 * découvre son résultat : un nombre qui apparaît d'un coup n'a pas le même effet qu'un nombre qu'on
 * regarde monter.
 *
 * Server Component : l'arc s'anime en CSS (`.gauge-arc`), seul le compteur est une feuille client.
 * La valeur finale est dans le HTML — juste sans JS comme sans animation.
 */
export function ScoreGauge({
  total,
  medalLabel,
  medalEmoji,
  objectiveReached,
}: {
  total: number | null
  medalLabel: string | null
  medalEmoji: string | null
  objectiveReached: boolean | null
}) {
  const pct = Math.min(100, Math.max(0, total ?? 0))
  const offset = CIRCUMFERENCE * (1 - pct / 100)
  return (
    <div className="relative size-40 flex-none">
      <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r={R} fill="none" strokeWidth="12" className="stroke-muted" />
        <circle
          cx="80"
          cy="80"
          r={R}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          className={cn('gauge-arc stroke-current', scoreColor(total).text)}
          style={
            {
              '--gauge-c': CIRCUMFERENCE,
              '--gauge-off': offset,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {total == null ? (
          <span className="text-4xl font-semibold">—</span>
        ) : (
          <>
            <p className="text-4xl font-semibold tabular-nums">
              <AnimatedNumber value={total} />
              <span className="text-base text-muted-foreground">/100</span>
            </p>
            {/* Le métal (ou ✅/🔁 sans médaille) : lisible d'un coup d'œil, là où le mot ne tiendrait pas. */}
            <p className="text-lg leading-none" aria-hidden>
              {medalEmoji ?? (objectiveReached ? '✅' : '🔁')}
            </p>
            {medalLabel && <p className={cn('text-[10px] font-semibold uppercase tracking-wider', scoreColor(total).text)}>{medalLabel}</p>}
          </>
        )}
      </div>
      <span className="sr-only">Note : {total ?? 'non notée'}{total != null && ' sur 100'}{medalFor(total) ? `, médaille ${medalLabel}` : ''}</span>
    </div>
  )
}
