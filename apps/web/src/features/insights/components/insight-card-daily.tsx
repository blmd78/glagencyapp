'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { eur } from '@/lib/format'
import { addDays as isoAddDays, frWeekdayShort } from '@glagency/core'
import type { DailyCa } from '@glagency/core'

/**
 * Complète une semaine (lundi `start` → +6 j) avec les jours à 0 € manquants — la
 * ventilation ne stocke que les jours avec des ventes, mais on veut TOUT voir, daté.
 * `cap` (exclu) borne la semaine en cours aux jours déjà ingérés.
 */
function fillWeek(start: string, dailies: DailyCa[], cap?: string): DailyCa[] {
  const byDate = new Map(dailies.map((d) => [d.date, d.ca]))
  const out: DailyCa[] = []
  for (let i = 0; i < 7; i++) {
    const date = isoAddDays(start, i)
    if (cap && date >= cap) break
    out.push({ date, ca: byDate.get(date) ?? 0 })
  }
  return out
}

/** Liste jour par jour du CA (contenu du survol « détail »), zéros grisés. */
function DailyList({ title, dailies }: { title: string; dailies: DailyCa[] }) {
  if (!dailies.length) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{title}</span>
      {dailies.map((d) => (
        <span key={d.date} className={cn('tabular-nums', d.ca === 0 && 'text-muted-foreground')}>
          {frWeekdayShort(d.date)} — {eur(d.ca)}
        </span>
      ))}
    </div>
  )
}

/** Infobulle ⓘ : détail CA jour par jour d'un modèle. */
export function DailyInfo({ label, weekStart, dailies }: { label: string; weekStart: string; dailies: DailyCa[] | undefined }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Détail CA/jour — ${label}`}
            className="self-center text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs font-normal">
          {Array.isArray(dailies) ? (
            <DailyList title="Semaine passée (S-1)" dailies={fillWeek(weekStart, dailies)} />
          ) : (
            <span>Détail indisponible pour cette génération.</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
