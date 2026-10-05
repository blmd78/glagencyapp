import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import { CalendarDays } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatEventDates, type AgencyEvent } from '../month-layout'
import type { Legend } from '../schema'
import { ColorDot } from './legend'
import { ModelAvatar } from './model-avatar'

/**
 * La fiche d'un événement en LECTURE — ce que voit tout le monde sauf l'admin, qui ouvre
 * l'édition à la place (demande Benoit 2026-09-28). Même fenêtre depuis la grille et la liste.
 */
export function EventView({ event, legend, trigger }: { event: AgencyEvent; legend: Legend; trigger: ReactNode }) {
  const label = event.color ? legend[event.color] : undefined
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        style={{ '--event-color': event.color ?? 'var(--muted-foreground)' } as CSSProperties}
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl gap-0 overflow-y-auto rounded-xl p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-background [&>button]:opacity-100 motion-reduce:animate-none"
      >
        <DialogHeader className="gap-4 space-y-0 bg-[color-mix(in_srgb,var(--event-color)_6%,var(--background))] p-6 pr-16 text-left sm:p-8 sm:pr-20">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ColorDot color={event.color} />
            {label || 'Événement'}
          </p>
          <div className="flex items-center gap-3">
            <ModelAvatar name={event.creatorName} url={event.creatorAvatarUrl} className="size-10" />
            <DialogTitle className="min-w-0 break-words text-2xl leading-tight sm:text-3xl">{event.title}</DialogTitle>
          </div>
          <DialogDescription className="flex items-start gap-2 text-sm leading-relaxed">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="first-letter:uppercase">{formatEventDates(event.startDate, event.endDate)}</span>
          </DialogDescription>
        </DialogHeader>
        {event.imageUrl && (
          // `unoptimized` : URL signée éphémère d'un bucket privé — l'optimiseur Vercel la
          // facturerait à chaque signature (guidelines-standard-feature § 7).
          <Image
            unoptimized
            loading="lazy"
            decoding="async"
            src={event.imageUrl}
            alt={event.title}
            width={1200}
            height={800}
            className="h-auto max-h-[65dvh] w-full bg-muted/30 object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
