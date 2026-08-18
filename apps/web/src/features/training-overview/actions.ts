'use server'

// Deux écritures de l'Overview encadrant : marquer un signalement résolu (droit Suivi) et
// relancer la notation IA d'une session (admin). Patron §4 des guidelines : `noGuard` +
// vérification UNE SEULE FOIS en tête de handler, refus = BusinessError.

import { revalidatePath } from 'next/cache'
import { BusinessError, noGuard, requireAdminProfile, requirePageProfile, runAction, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { scoreSessionById } from '@/lib/services/training-scoring'
import { createClient } from '@/lib/supabase/server'
import { rescoreInput, resolveInput } from './schema'

/** Consultation « en tant que » = LECTURE seule : aucune écriture au nom de la personne visitée. */
const DENY_IMPERSONATION = 'Action indisponible en consultation (mode « en tant que »)'

/**
 * « Résolu » : le signalement est traité. `.is('resolved_at', null)` rend l'écriture IDEMPOTENTE —
 * deux encadrants qui cliquent en même temps n'écrasent pas le premier qui a résolu.
 * La RLS `training_reports_update` (0117) exige `has_page('frm-suivi')` : même règle qu'ici.
 */
export async function resolveReport(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: resolveInput,
    input: raw,
    guard: noGuard,
    handler: async ({ reportId }) => {
      const profile = await requirePageProfile('frm-suivi')
      if (await readStateCookie()) throw new BusinessError(DENY_IMPERSONATION)
      const supabase = await createClient()
      const { error } = await supabase
        .from('training_reports')
        .update({ resolved_at: new Date().toISOString(), resolved_by: profile.id })
        .eq('id', reportId)
        .is('resolved_at', null)
      if (error) throw new Error(error.message)
      revalidatePath('/formation/overview')
    },
  })
}

/**
 * Re-noter une session déjà notée (ADMIN) : `scoreSessionById(..., { force: true })` rappelle l'IA
 * et réécrit la note ; le trigger 0118/0119 recalcule `training_case_bests` et les stats DEPUIS
 * les sessions (une re-notation à la baisse est donc prise en compte). Coûte des tokens : d'où la
 * confirmation côté UI et la réserve aux admins.
 */
export async function rescoreSession(raw: unknown): Promise<ActionResult<{ total: number }>> {
  return runAction({
    schema: rescoreInput,
    input: raw,
    guard: noGuard,
    handler: async ({ sessionId }) => {
      await requireAdminProfile()
      if (await readStateCookie()) throw new BusinessError(DENY_IMPERSONATION)
      let res: { total: number }
      try {
        res = await scoreSessionById(sessionId, { force: true })
      } catch (err) {
        // Échec IA (modèle, réseau, session non notable) : message métier, pas un faux positif Sentry.
        console.error('[training rescore]', err)
        throw new BusinessError('La re-notation a échoué — réessaie dans un instant')
      }
      revalidatePath('/formation/overview')
      revalidatePath(`/formation/session/${sessionId}`)
      revalidatePath('/formation/ma-formation')
      return res
    },
  })
}
