import 'server-only'
import * as Sentry from '@sentry/nextjs'
import type { Trophy } from '@glagency/core'
import { createAdminClient } from '@glagency/db'

/**
 * Un tour de roue offert par trophée débloqué (0120).
 *
 * QUI DÉCIDE QUOI : les trophées sont calculés en TypeScript (`computeTrophies`) à partir des
 * agrégats de la base ; la RPC ne fait que matérialiser les tickets manquants. Elle ne revérifie
 * PAS que le trophée est mérité — d'où le service-role et l'absence de `grant` à `authenticated`
 * (0120) : l'appel ne doit jamais pouvoir venir du navigateur.
 *
 * IDEMPOTENT par construction : l'index unique `(profile_id, trophy_key)` fait qu'un trophée ne
 * paie qu'une fois, pour toujours. On peut donc rejouer l'octroi à chaque visite sans compter ce
 * qui a déjà été servi — et l'octroi est RÉTROACTIF sans traitement de reprise : au premier
 * passage, les trophées déjà acquis créent leurs tickets d'un coup.
 *
 * Ne rend jamais d'erreur : un octroi raté ne doit pas casser « Ma formation ». Mais il part dans
 * Sentry — comme l'octroi hebdo, c'est un mécanisme qui distribue de l'argent, une panne muette
 * ici voudrait dire « plus aucune récompense » sans que personne le sache.
 */
export async function grantTrophyTickets(profileId: string, trophies: Trophy[]): Promise<void> {
  const earned = trophies.filter((t) => t.earned).map((t) => ({ key: t.key, label: t.label }))
  if (earned.length === 0) return
  try {
    const { error } = await createAdminClient().rpc('training_trophy_grant', {
      p_profile: profileId,
      p_trophies: earned,
    })
    if (error) Sentry.captureException(new Error(`[roue] tours de trophées non octroyés : ${error.message}`))
  } catch (err) {
    Sentry.captureException(err)
  }
}
