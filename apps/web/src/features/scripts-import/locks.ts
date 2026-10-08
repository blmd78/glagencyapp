import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@glagency/db'
import type { createClient } from '@/lib/supabase/server'
import type { PrepareClaims } from './prepare-once'
import type { SendLock } from './send-rules'

/** Clés et verrous de l'import en base, branchés sur les règles pures (`prepareOnce`, `withSendLock`). */

/** Réservations des clés de « Préparer » (`script_prepare_requests`, 0189) — client RLS : chacun SES clés. */
export function prepareClaims(supabase: Awaited<ReturnType<typeof createClient>>, profileId: string): PrepareClaims {
  const table = () => supabase.from('script_prepare_requests')
  return {
    claim: async (key) => {
      const { error } = await table().insert({ request_id: key, created_by: profileId })
      if (error?.code === '23505') return false
      if (error) throw new Error(error.message)
      return true
    },
    lookup: async (key) => {
      const { data, error } = await table().select('import_id').eq('request_id', key).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return { status: 'released' }
      return data.import_id ? { status: 'done', importId: data.import_id } : { status: 'pending' }
    },
    complete: async (key, importId) => {
      const { error } = await table().update({ import_id: importId }).eq('request_id', key)
      if (error) throw new Error(error.message)
    },
    release: async (key) => {
      const { error } = await table().delete().eq('request_id', key)
      if (error) Sentry.captureException(new Error(error.message))
    },
  }
}

/** Verrou d'envoi en base (0187, service role) : `acquire` est un UPDATE conditionnel atomique. */
export function sendLock(): SendLock {
  const admin = createAdminClient()
  return {
    acquire: async (holder) => {
      const { data, error } = await admin.rpc('acquire_script_send_lock', { p_holder: holder })
      if (error) throw new Error(error.message)
      return data === true
    },
    release: async (holder) => {
      const { error } = await admin.rpc('release_script_send_lock', { p_holder: holder })
      if (error) Sentry.captureException(new Error(error.message))
    },
  }
}
