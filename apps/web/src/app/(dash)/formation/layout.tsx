import type { ReactNode } from 'react'
import { SoundToggle } from '@/components/training/sound-toggle'

/**
 * Layout de la face Formation. Il ne rend aucune structure (elle vient du layout `(dash)`) : son
 * seul rôle est de poser l'interrupteur du son, FLOTTANT (`fixed`) — il n'entre donc pas dans le
 * flux et ne décale aucune page, et il vaut sur toute la face, roue comprise.
 *
 * Il portait aussi l'octroi automatique des tours de roue (`after(grantWheelTicketsIfDue)`),
 * supprimé avec le top 3 hebdo : depuis la règle du 2026-08-24, un tour n'est plus gagné mais
 * lancé par un encadrant.
 */
export default function FormationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SoundToggle />
    </>
  )
}
