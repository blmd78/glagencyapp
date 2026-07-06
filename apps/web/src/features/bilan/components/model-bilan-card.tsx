import { Fragment } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { num } from '@/lib/format'
import type { ModelBilan } from '../types'

/** Écart signé vs une référence : vert si ≥ 0, rouge sinon, « — » sans référence.
 *  La valeur brute de la référence reste lisible au survol (title natif). */
function Delta({
  cur,
  refValue,
  refLabel,
  fmt,
}: {
  cur: number | null
  refValue: number | null
  refLabel: string
  fmt: (v: number) => string
}) {
  if (refValue == null || refValue === 0 || cur == null) {
    return <span className="text-right text-muted-foreground">—</span>
  }
  const d = cur - refValue
  return (
    <span
      title={`${refLabel} : ${fmt(refValue)}`}
      className={cn(
        'text-right font-medium tabular-nums',
        d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      {d >= 0 ? '+' : '−'}
      {fmt(Math.abs(d))}
    </span>
  )
}

const HEAD = 'text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

/**
 * Carte bilan d'un modèle : une grille UNIQUE alignée en colonnes
 * (valeur de la semaine · écart vs S-1 · écart vs M-1) — chaque métrique se lit
 * d'un trait, les colonnes se comparent verticalement. Les références brutes
 * (S-1/M-1) sont au survol des écarts, pas à l'écran.
 */
export function ModelBilanCard({ m }: { m: ModelBilan }) {
  const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`
  const eur1 = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`

  const rows = [
    { label: 'Abonnés', cur: m.newSubs, prev: m.newSubsPrev, lm: m.newSubsLm, fmt: (v: number) => num(v) },
    { label: 'CA net', cur: m.ca, prev: m.caPrev, lm: m.caLm, fmt: eur },
    { label: 'LTV', cur: m.ltv, prev: m.ltvPrev, lm: m.ltvLm, fmt: eur1 },
  ] as const

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <Badge className={modelColor(m.name)}>{m.name}</Badge>

        <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-sm">
          <span />
          <span className={HEAD}>Semaine</span>
          <span className={HEAD}>vs S-1</span>
          <span className={HEAD}>vs M-1</span>

          {rows.map((r) => (
            <Fragment key={r.label}>
              <span className="text-muted-foreground">{r.label}</span>
              <span className="text-right font-semibold tabular-nums">
                {r.cur != null && r.cur > 0 ? r.fmt(r.cur) : '—'}
              </span>
              <Delta cur={r.cur} refValue={r.prev} refLabel="S-1" fmt={r.fmt} />
              <Delta cur={r.cur} refValue={r.lm} refLabel="M-1" fmt={r.fmt} />
            </Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
