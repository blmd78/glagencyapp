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

/**
 * Contexte de navigation, ou null hors provider. Ne throw JAMAIS en render : un décalage
 * de modules (chunk périmé après déploiement, HMR qui mélange ancien/nouveau) rendait toute
 * l'app inutilisable en boucle « Fast Refresh full reload » — sans provider on dégrade en
 * navigation <Link> native, c'est tout.
 */
export function useNavTransition() {
  return useContext(Ctx)
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
