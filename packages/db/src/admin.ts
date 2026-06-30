import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Client Supabase **service-role** (BYPASS RLS).
 * Serveur de confiance UNIQUEMENT (ingestion, tâches admin).
 * Ne JAMAIS l'exposer au navigateur.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY manquants (cf. .env.example)')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
