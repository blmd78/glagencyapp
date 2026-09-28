import { cn } from '@/lib/utils'
import { EVENT_COLORS, type EventColor, type Legend } from '../schema'

/** Pastille de couleur d'un événement — le gris neutre quand il n'en a pas. */
export function ColorDot({ color, className }: { color: EventColor | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full', !color && 'bg-muted-foreground/40', className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

/** La légende au-dessus du calendrier : seules les couleurs qui ont un nom, dans l'ordre de la palette. */
export function LegendBar({ legend }: { legend: Legend }) {
  const named = EVENT_COLORS.filter((c) => legend[c])
  if (named.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {named.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <ColorDot color={c} />
          {legend[c]}
        </li>
      ))}
    </ul>
  )
}
