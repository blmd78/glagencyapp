import type { ReactNode } from 'react'
import { SoundToggle } from '@/components/training/sound-toggle'

/**
 * Layout de la face Formation. Il ne rend aucune structure (elle vient du layout `(dash)`) : son
 * seul rôle est de poser l'interrupteur du son, FLOTTANT (`fixed`) — il n'entre donc pas dans le
 * flux et ne décale aucune page, et il vaut sur toute la face.
 *
 * Le THÈME GLA (`.gla`, `formation-theme.css`) n'est PAS posé ici mais page par page : seuls les
 * écrans du chatteur (Ma formation, Modules, session) le portent. Les écrans d'encadrement
 * (Overview, Roue, Catalogue, Recrutement) restent dans le design du CRM — ce sont des outils de
 * gestion, pas le jeu, et leurs utilisateurs passent leur journée dans le reste de l'app.
 *
 * Il portait aussi l'octroi automatique des tours de roue, supprimé avec le top 3 hebdo : depuis la
 * règle du 2026-08-24, un tour n'est plus gagné mais lancé par un encadrant.
 */
export default function FormationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SoundToggle />
    </>
  )
}
