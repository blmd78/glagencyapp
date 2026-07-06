import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { eur as eur0, num } from '@/lib/format'
import type { ModelBilan } from '../types'

/** « S-1 : 3 326 −142 » — référence + delta coloré (vert si ≥, rouge sinon). */
function Ref({
  label,
  cur,
  ref,
  money,
}: {
  label: string
  cur: number | null
  ref: number | null
  money?: boolean
}) {
  const fmt = (v: number) => (money ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €` : num(v))
  if (ref == null || ref === 0 || cur == null) {
    return (
      <span className="text-muted-foreground">
        {label} : {ref == null || ref === 0 ? '—' : fmt(ref)}
      </span>
    )
  }
  const d = cur - ref
  return (
    <span className="text-muted-foreground">
      {label} : {fmt(ref)}{' '}
      <b className={cn('tabular-nums', d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
        {d >= 0 ? '+' : ''}
        {money ? `${d.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €` : num(d)}
      </b>
    </span>
  )
}

function MetricRow({
  label,
  value,
  cur,
  prev,
  lm,
  money,
}: {
  label: string
  value: string
  cur: number | null
  prev: number | null
  lm: number | null
  money?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs tabular-nums">
        <Ref label="S-1" cur={cur} ref={prev} money={money} />
        <Ref label="M-1" cur={cur} ref={lm} money={money} />
      </div>
    </div>
  )
}

/** Carte bilan d'un modèle : nouveaux abonnés, CA net, LTV — avec S-1 et M-1 (S-4). */
export function ModelBilanCard({ m }: { m: ModelBilan }) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">{m.name}</h3>
          {m.ca > 0 && <span className="text-sm tabular-nums text-muted-foreground">{eur0(m.ca)}</span>}
        </div>
        <MetricRow
          label="Nouveaux abonnés"
          value={m.newSubs > 0 ? num(m.newSubs) : '—'}
          cur={m.newSubs}
          prev={m.newSubsPrev}
          lm={m.newSubsLm}
        />
        <MetricRow
          label="CA net"
          value={m.ca > 0 ? eur0(m.ca) : '—'}
          cur={m.ca}
          prev={m.caPrev}
          lm={m.caLm}
          money
        />
        <MetricRow
          label="LTV moyenne"
          value={m.ltv != null ? `${m.ltv.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €` : '—'}
          cur={m.ltv}
          prev={m.ltvPrev}
          lm={m.ltvLm}
          money
        />
      </CardContent>
    </Card>
  )
}
