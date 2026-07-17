import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { landingHref } from '@/config/workspaces'

// /chatter nu → 1ʳᵉ page autorisée du profil (pas /chatter/overview en dur).
export default async function ChatterHome() {
  const profile = await getProfile()
  redirect(profile ? landingHref(profile) : '/login')
}
