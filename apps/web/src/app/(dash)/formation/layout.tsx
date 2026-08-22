import { after } from 'next/server'
import type { ReactNode } from 'react'
import { getProfile, hasPageAccess } from '@/lib/auth'
import { grantWheelTicketsIfDue } from '@/lib/services/wheel-grant'

/**
 * Layout de la face Formation. Il ne rend AUCUN markup (la structure vient du layout `(dash)`) :
 * son unique rôle est de déclencher l'octroi des tours de roue dès qu'on met les pieds sur la face,
 * au lieu d'attendre que quelqu'un ouvre `/formation/roue`. L'octroi étant global, la visite d'une
 * seule personne sert toute la promo.
 *
 * `after()` : le travail part APRÈS la réponse — il ne retarde jamais l'affichage d'une page, et un
 * échec ne peut pas la casser (`grantWheelTicketsIfDue` ne rejette pas, et une erreur levée dans un
 * layout ne serait de toute façon pas rattrapée par sa propre error boundary).
 *
 * Réservé aux porteurs d'un droit de la face (les admins passent partout) : sans ce filtre, un
 * simple passage d'URL par n'importe quel membre connecté déclencherait l'octroi.
 */
export default async function FormationLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile()
  if (hasPageAccess(profile, 'frm-entrainement') || hasPageAccess(profile, 'frm-suivi')) {
    after(grantWheelTicketsIfDue)
  }
  return children
}
