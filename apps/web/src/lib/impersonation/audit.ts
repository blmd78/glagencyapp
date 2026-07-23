import * as Sentry from '@sentry/nextjs'
import { readStateCookie, getActorForSid } from '@/lib/impersonation/session'

/**
 * Trace l'acteur réel derrière une mutation faite EN impersonation (write-capable → l'écriture
 * est attribuée à la cible en base ; ce breadcrumb rattache l'admin réel pour l'audit). No-op hors
 * impersonation (lecture cookie seule, aucun accès DB). Best-effort : n'échoue jamais l'action.
 */
export async function attributeIfImpersonating(): Promise<void> {
  try {
    const state = await readStateCookie()
    if (!state) return
    const row = await getActorForSid(state.sid)
    Sentry.addBreadcrumb({
      category: 'impersonation',
      level: 'info',
      message: 'mutation during impersonation',
      data: { real_actor: row?.actorId ?? 'unknown', target: row?.targetId ?? 'unknown' },
    })
  } catch {
    // best-effort : l'audit ne doit jamais casser une action
  }
}
