'use client'

import { createContext, useContext, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingDots } from '@/components/loading-dots'

/**
 * Navigation sidebar avec feedback PLEINE PAGE immédiat : le clic passe par une transition
 * React (navigate), et tant qu'elle est en cours l'overlay recouvre la zone de contenu avec
 * le loader — à 0 ms, même quand le serveur est froid (cold start Workers 2-3 s). Le
 * loading.tsx de route prend le relais dès que le serveur commence à répondre.
 */

const Ctx = createContext<{ navigate: (href: string) => void; pending: boolean } | null>(null)

export function NavTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const navigate = (href: string) => startTransition(() => router.push(href))
  return <Ctx.Provider value={{ navigate, pending }}>{children}</Ctx.Provider>
}

export function useNavTransition() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNavTransition doit être utilisé sous NavTransitionProvider')
  return ctx
}

/** Overlay posé sur la zone de contenu (parent en `relative`) pendant une navigation. */
export function NavPendingOverlay() {
  const { pending } = useNavTransition()
  if (!pending) return null
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
      <LoadingDots />
    </div>
  )
}
