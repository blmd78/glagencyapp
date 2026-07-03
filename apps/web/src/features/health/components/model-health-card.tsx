'use client'

import { useState } from 'react'
import { CalendarDays, ChevronRight, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { eur, eur2, num, pct } from '@/lib/format'
import type { ModelHealth } from '../types'
import { LtvGauge } from './ltv-gauge'
import { StatusBadge } from './status-badge'

/**
 * Carte santé d'un modèle (reprise de l'ancien dashboard) : jauge LTV + chiffres période,
 * LTV du dernier jour / de la semaine, manque vs cible, et chatteurs dépliables.
 */
export function ModelHealthCard({ model, target }: { model: ModelHealth; target: number }) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-4">
          <LtvGauge ltv={model.ltv} status={model.status} target={target} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={modelColor(model.name)}>{model.name}</Badge>
              <StatusBadge status={model.status} />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="font-semibold tabular-nums">{eur(model.ca)}</span>
              <span className="tabular-nums text-muted-foreground">
                {num(model.newSubs)} nvx subs · {num(model.renewSubs)} renouv ·{' '}
                {pct(model.part)} du CA
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {model.weekLtv !== null && (
                <span className="flex items-center gap-1 tabular-nums">
                  <CalendarDays className="size-3" /> Cette semaine :{' '}
                  <b>{eur2(model.weekLtv)}</b>/sub
                </span>
              )}
              {model.missingToTarget > 0 && (
                <span className="flex items-center gap-1 tabular-nums text-amber-600 dark:text-amber-400">
                  <Zap className="size-3" /> Manque {eur(model.missingToTarget)} pour LTV{' '}
                  {target}
                </span>
              )}
            </div>
          </div>
        </div>

        {model.chatters.length > 0 && (
          <div className="border-t pt-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
              Voir les chatteurs ({model.chatters.length})
            </button>
            {open && (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {model.chatters.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-baseline justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{eur(c.ca)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
