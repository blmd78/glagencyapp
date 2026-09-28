import type { ReactNode } from 'react'
import Image from 'next/image'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatEventDates, type AgencyEvent } from '../month-layout'
import type { Legend } from '../schema'
import { ColorDot } from './legend'

/**
 * La fiche d'un événement en LECTURE — ce que voit tout le monde sauf l'admin, qui ouvre
 * l'édition à la place (demande Benoit 2026-09-28). Même fenêtre depuis la grille et la liste.
 */
export function EventView({ event, legend, trigger }: { event: AgencyEvent; legend: Legend; trigger: ReactNode }) {
  const label = event.color ? legend[event.color] : undefined
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">{formatEventDates(event.startDate, event.endDate)}</DialogDescription>
        </DialogHeader>
        {label && (
          <p className="flex items-center gap-2 text-sm">
            <ColorDot color={event.color} />
            {label}
          </p>
        )}
        {event.imageUrl && (
          // `unoptimized` : URL signée éphémère d'un bucket privé — l'optimiseur Vercel la
          // facturerait à chaque signature (guidelines-standard-feature § 7).
          <Image
            unoptimized
            src={event.imageUrl}
            alt={event.title}
            width={1200}
            height={800}
            className="h-auto max-h-[60vh] w-full rounded-md border object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
