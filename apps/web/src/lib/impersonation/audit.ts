import * as Sentry from '@sentry/nextjs'
import { readStateCookie, getActorForSid } from '@/lib/impersonation/session'

/**
 * Trace l'acteur réel derrière une mutation faite EN impersonation (write-capable → l'écriture
 * est attribuée à la cible en base ; ce message rattache l'admin réel pour l'audit). No-op hors
 * impersonation (lecture cookie seule, aucun accès DB). Best-effort : n'échoue jamais l'action.
 *
 * Sentry ici est errors-only (pas de tracing, `apps/web/sentry.server.config.ts`) : un
 * `addBreadcrumb` seul n'est JAMAIS transmis (il faut un événement capturé dans le même scope).
 * Une mutation qui RÉUSSIT ne lève rien → on capture explicitement via `captureMessage`, comme
 * `impersonate:start`/`impersonate:stop` (`actions.ts`/`teardown.ts`).
 */
export async function attributeIfImpersonating(): Promise<void> {
  try {
    const state = await readStateCookie()
    if (!state) return
    const row = await getActorForSid(state.sid)
    // Nommé « action » (et non « mutation ») : runAction appelle ce hook sur TOUTE action
    // (lectures comprises) ; le cœur de l'audit reste l'acteur réel derrière la session cible.
    Sentry.captureMessage('impersonation:action', {
      level: 'info',
      extra: {
        real_actor: row?.actorId ?? 'unknown',
        target: row?.targetId ?? 'unknown',
      },
    })
  } catch {
    // best-effort : l'audit ne doit jamais casser une action
  }
}
