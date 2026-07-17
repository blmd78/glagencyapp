'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num } from '@/lib/format'
import type { InsightModelSplit, WeekTracking } from '../types'

/**
 * Colonne droite (1/4) d'une carte insight : suivi de la semaine en cours — extrait de
 * `insight-card.tsx` (split > 300 lignes, `docs/guidelines-standard-feature.md` §1). DOM
 * identique à l'ancien bloc inline.
 */
export function InsightWeekColumn({ week, models }: { week: WeekTracking; models: InsightModelSplit[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 lg:col-span-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Semaine en cours
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">{week.label}</span>
      <Badge
        className={cn(
          'w-fit text-xs',
          week.days === 0 && !week.struggling
            ? STATUS_COLORS.neutral
            : week.struggling
              ? STATUS_COLORS.danger
              : STATUS_COLORS.positive,
        )}
      >
        {week.days === 0 && !week.struggling
          ? 'En attente de données'
          : week.struggling
            ? 'En difficulté'
            : 'Dans la cible'}
      </Badge>
      <span className="text-xl font-semibold tabular-nums">{eur(week.ca)}</span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {eur(week.perDay)}/j · j{num(week.days)}/7
      </span>
      {week.deltaPct != null && (
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            week.deltaPct > 10
              ? 'text-green-600 dark:text-green-400'
              : week.deltaPct < -10
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {week.deltaPct > 10 ? '↗' : week.deltaPct < -10 ? '↘' : '→'}{' '}
          {week.deltaPct > 0 ? '+' : ''}
          {week.deltaPct} % vs S-1
        </span>
      )}
      {models.some((m) => m.weekDays > 0) && (
        <div className="flex flex-col gap-1 border-t pt-2 text-xs tabular-nums text-muted-foreground">
          {models
            .filter((m) => m.weekDays > 0)
            .map((m) => (
              <span key={m.name}>
                {m.name} : {eur(m.weekCa)} ({num(m.weekDays)} j)
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
