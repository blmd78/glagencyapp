import { cn } from '@/lib/utils'
import type { WeekRow } from '../month-layout'
import { EventChip } from './event-chip.client'

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
/** Hauteur d'une ligne d'événements (barre 20 px + 4 px d'écart). */
const LANE_PX = 24

export function MonthGrid({ month, today, weeks, canEdit }: { month: string; today: string; weeks: WeekRow[]; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5">{d}</div>
        ))}
      </div>
      {weeks.map((w) => (
        <div key={w.days[0]} className="relative grid grid-cols-7 border-b last:border-b-0" style={{ minHeight: 64 + w.lanes * LANE_PX }}>
          {w.days.map((d) => (
            <div key={d} className={cn('border-r px-2 pt-1.5 text-xs last:border-r-0', d.slice(0, 7) !== month && 'text-muted-foreground/50')}>
              <span className={cn(d === today && 'font-semibold text-primary underline underline-offset-4')}>{Number(d.slice(8))}</span>
            </div>
          ))}
          {w.bars.length > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 top-7 grid grid-cols-7 gap-y-1 px-1"
              style={{ gridTemplateRows: `repeat(${w.lanes}, 20px)` }}
            >
              {w.bars.map((b) => (
                <div key={`${b.event.id}-${w.days[0]}`} className="pointer-events-auto" style={{ gridColumn: `${b.startCol + 1} / span ${b.span}`, gridRow: b.lane + 1 }}>
                  <EventChip bar={b} canEdit={canEdit} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
