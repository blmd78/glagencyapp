import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import type { ModelRow } from '../types'

const eur = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
const pct = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-medium tabular-nums">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  )
}

export function ModelCard({ model }: { model: ModelRow }) {
  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="gap-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge
            variant="outline"
            className={cn('px-2.5 py-1 text-sm', modelColor(model.name))}
          >
            {model.name}
          </Badge>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums">{eur(model.total)}</div>
            <div className="text-xs text-muted-foreground">CA juin</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="PPV" value={eur(model.ppv)} />
          <Stat label="Tips" value={eur(model.tips)} />
          <Stat label="Renew" value={eur(model.renew)} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {model.active} actifs / {model.planned} assignés
          </span>
          <span>{eur(model.per)} / chatteur</span>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        <div className="max-h-64 divide-y overflow-y-auto border-t">
          {model.chatters.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between gap-2 px-4 py-1.5 text-sm"
            >
              <span className="truncate">{c.name}</span>
              <span className="flex shrink-0 items-center gap-3 tabular-nums">
                <span className="text-xs text-muted-foreground">{pct(c.tauxConv)}</span>
                <span className="w-20 text-right font-medium">{eur(c.ca)}</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
