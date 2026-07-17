'use client'

import { useTransition, type ReactNode } from 'react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { NavTransitionCtx, useNavTransition } from '@/components/nav-transition-context'
import { LoadingDots } from '@/components/loading-dots'

/**
 * Navigation sidebar avec feedback PLEINE PAGE immédiat : le clic passe par une transition
 * React (navigate), et tant qu'elle est en cours l'overlay recouvre la zone de contenu avec
 * le loader — à 0 ms, même quand le serveur est froid (cold start Workers 2-3 s). Le
 * loading.tsx de route prend le relais dès que le serveur commence à répondre.
 * Exports 100 % composants (le hook vit dans nav-transition-context.ts) = frontière
 * Fast Refresh saine.
 */

export function NavTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // `href` provient déjà d'un href de nav typé côté appelant (Route) — le contexte
  // reste en `string` pour rester générique, d'où le cast à ce point d'entrée unique.
  const navigate = (href: string) => startTransition(() => router.push(href as Route))
  return <NavTransitionCtx.Provider value={{ navigate, pending }}>{children}</NavTransitionCtx.Provider>
}

/** Overlay posé sur la zone de contenu (parent en `relative`) pendant une navigation. */
export function NavPendingOverlay() {
  const ctx = useNavTransition()
  if (!ctx?.pending) return null
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
      <LoadingDots />
    </div>
  )
}
