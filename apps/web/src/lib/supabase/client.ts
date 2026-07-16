import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@glagency/db'
import { getPublicEnv } from '@/lib/env'

/** Client Supabase navigateur (Client Components). */
export function createClient() {
  const env = getPublicEnv()
  return createBrowserClient<Database>(env.url, env.publishableKey)
}
