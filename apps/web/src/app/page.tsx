import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { landingHref } from '@/config/workspaces'

// Racine = résolveur d'atterrissage : chacun tombe sur sa 1ʳᵉ page autorisée (les 2 faces),
// pas sur un /chatter/overview codé en dur (que tout le monde n'a pas → 404).
export default async function Home() {
  const profile = await getProfile()
  redirect(profile ? landingHref(profile) : '/login')
}
