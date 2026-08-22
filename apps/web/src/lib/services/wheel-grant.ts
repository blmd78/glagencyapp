import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { WHEEL_TOP_N } from '@glagency/core'
import { createAdminClient } from '@glagency/db'

/**
 * Octroi des tours de roue, déclenché depuis N'IMPORTE QUELLE page de la face Formation.
 *
 * POURQUOI : l'octroi n'était appelé qu'au montage de `/formation/roue`. Une semaine sans qu'aucun
 * chatter n'ouvre cette page-là = tickets jamais créés, et donc récompenses perdues. Il est
 * désormais accroché au layout de la face : y passer suffit, et comme l'octroi est GLOBAL, la
 * visite d'une seule personne sert toute la promo.
 *
 * DEUX GARDE-FOUS DE COÛT, parce que le layout re-rend à chaque navigation ET à chaque réponse de
 * Server Action (donc à chaque message envoyé au fan, sur `/formation/session`) :
 *  1. ici, une mémoire PAR INSTANCE de fonction — elle évite jusqu'à l'aller-retour réseau ;
 *  2. côté base, `training_wheel_grant_due` s'auto-limite à une tentative par heure (mémoire
 *     partagée entre toutes les instances). C'est celle-là qui compte vraiment ; la mémoire locale
 *     est plus courte exprès, pour qu'une instance fraîche ne retarde pas l'octroi du lundi matin.
 *
 * Ne rend jamais d'erreur : un octroi raté ne doit pas casser une page de formation. Mais il part
 * dans Sentry — c'est le seul mécanisme qui distribue de l'argent, une panne muette ici voudrait
 * dire « plus aucune récompense » sans que personne le sache.
 */
let derniereTentative = 0
const INTERVALLE_LOCAL_MS = 10 * 60 * 1000

export async function grantWheelTicketsIfDue(): Promise<void> {
  const maintenant = Date.now()
  if (maintenant - derniereTentative < INTERVALLE_LOCAL_MS) return
  derniereTentative = maintenant
  try {
    const { error } = await createAdminClient().rpc('training_wheel_grant_due', { p_top: WHEEL_TOP_N })
    if (error) Sentry.captureException(new Error(`[roue] octroi automatique impossible : ${error.message}`))
  } catch (err) {
    Sentry.captureException(err)
  }
}
