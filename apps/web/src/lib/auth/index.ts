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

/** Profil applicatif (rôle + display_name) de l'utilisateur courant, ou null. */
export async function getProfile() {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', user.id)
    .single()
  return data
}
