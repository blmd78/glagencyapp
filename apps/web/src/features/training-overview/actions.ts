'use server'

// Deux écritures de l'Overview encadrant : marquer un signalement résolu (droit Suivi) et
// relancer la notation IA d'une session (admin). Patron §4 des guidelines : `noGuard` +
// vérification UNE SEULE FOIS en tête de handler, refus = BusinessError.

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BusinessError, noGuard, requireAdminProfileLive, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { scoreSessionById } from '@/lib/services/training-scoring'
import { createClient } from '@/lib/supabase/server'

// Schémas INLINE (guidelines §5) : ces deux actions n'ont pas de formulaire, un `schema.ts` de
// feature pour deux `z.object({ … z.uuid() })` n'apportait rien.
const resolveInput = z.object({ reportId: z.uuid() })
const rescoreInput = z.object({ sessionId: z.uuid() })

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
      const profile = await requirePageProfileLive('frm-suivi')
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
      await requireAdminProfileLive()
      let res: { total: number }
      try {
        res = await scoreSessionById(sessionId, { force: true })
      } catch (err) {
        // L'utilisateur reçoit un message métier (pas un `error.message` brut), MAIS la cause reste
        // technique — modèle IA, réseau, statut inattendu : sans `captureException`, `runAction`
        // n'enverrait rien à Sentry (une BusinessError n'est jamais rapportée) et une panne de
        // notation resterait invisible côté admin.
        Sentry.captureException(err)
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
