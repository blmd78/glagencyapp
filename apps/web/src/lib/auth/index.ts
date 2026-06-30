import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Utilisateur courant (ou null) — valide le JWT côté serveur. */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Garde : redirige vers /login si pas de session. */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}
