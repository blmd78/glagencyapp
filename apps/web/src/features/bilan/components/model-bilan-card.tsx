import { Fragment } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { num } from '@/lib/format'
import type { ModelBilan } from '../types'

/** Cellule de référence : le VRAI montant de la période (S-1/M-1), suivi de
 *  l'écart signé entre parenthèses (vert si ≥ 0, rouge sinon). « — » sans donnée. */
function RefCell({
  cur,
  refValue,
  fmt,
  fmtDelta,
}: {
  cur: number | null
  refValue: number | null
  fmt: (v: number) => string
  fmtDelta: (v: number) => string
}) {
  if (refValue == null || refValue === 0) {
    return <span className="text-right text-muted-foreground">—</span>
  }
  const d = cur != null ? cur - refValue : null
  return (
    <span className="text-right tabular-nums whitespace-nowrap">
      {fmt(refValue)}
      {d != null && (
        <span
          className={cn(
            'ml-1 font-medium',
            d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          ({d >= 0 ? '+' : '−'}
          {fmtDelta(Math.abs(d))})
        </span>
      )}
    </span>
  )
}

const HEAD = 'text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

/**
 * Carte bilan d'un modèle : une grille UNIQUE alignée en colonnes
 * (Semaine · S-1 · M-1). Les colonnes de référence montrent le VRAI montant de la
 * période avec l'écart signé entre parenthèses — ex. « 20 936 € (+3 623) ».
 */
export function ModelBilanCard({ m }: { m: ModelBilan }) {
  const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`
  const eur1 = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`

  const int = (v: number) => Math.round(v).toLocaleString('fr-FR')
  const dec1 = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  const rows = [
    { label: 'Abonnés', cur: m.newSubs, prev: m.newSubsPrev, lm: m.newSubsLm, fmt: (v: number) => num(v), fmtDelta: int },
    { label: 'CA net', cur: m.ca, prev: m.caPrev, lm: m.caLm, fmt: eur, fmtDelta: int },
    { label: 'LTV', cur: m.ltv, prev: m.ltvPrev, lm: m.ltvLm, fmt: eur1, fmtDelta: dec1 },
    // % du CA hors script N°1 MyPuls (écarts en points) — « — » tant que pas de mesure.
    { label: 'Hors S1', cur: m.horsS1, prev: m.horsS1Prev, lm: m.horsS1Lm, fmt: (v: number) => `${Math.round(v)} %`, fmtDelta: (v: number) => `${Math.round(v)} pt` },
  ] as const

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <Badge className={modelColor(m.name)}>{m.name}</Badge>

        <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-sm">
          <span />
          <span className={HEAD}>Semaine</span>
          <span className={HEAD}>S-1</span>
          <span className={HEAD}>M-1</span>

          {rows.map((r) => (
            <Fragment key={r.label}>
              <span className="text-muted-foreground">{r.label}</span>
              <span className="text-right font-semibold tabular-nums">
                {r.cur != null && r.cur > 0 ? r.fmt(r.cur) : '—'}
              </span>
              <RefCell cur={r.cur} refValue={r.prev} fmt={r.fmt} fmtDelta={r.fmtDelta} />
              <RefCell cur={r.cur} refValue={r.lm} fmt={r.fmt} fmtDelta={r.fmtDelta} />
            </Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
