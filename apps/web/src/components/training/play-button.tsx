'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import type { ButtonProps } from '@/components/ui/button'
import { startSession } from '@/lib/training/start-session'

/**
 * « Jouer » / « Rejouer » / « Continuer » : démarre (ou reprend) une session sur un cas puis navigue
 * vers /formation/session/[id]. Partagé (Modules, session, Ma formation) — d'où components/.
 */
export function PlayButton({
  caseId,
  label = 'Jouer',
  ...props
}: { caseId: string; label?: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <ActionButton
      size="sm"
      pending={pending}
      {...props}
      onClick={() =>
        start(async () => {
          const r = await startSession({ caseId })
          if (!r.success) {
            toast.error(r.error)
            return
          }
          if (r.data.resumed) toast.info('Tu as déjà une session en cours — on la reprend')
          // `as Route` : `typedRoutes` n'accepte pas une string interpolée pour un segment dynamique
          // (même patron que `url-tabs.tsx`).
          router.push(`/formation/session/${r.data.sessionId}` as Route)
        })
      }
    >
      {label}
    </ActionButton>
  )
}
