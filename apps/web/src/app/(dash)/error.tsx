'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

// Filet d'erreur au niveau du dashboard : une erreur de rendu/service ne fait tomber que la
// zone `children` (le layout, sidebar comprise, reste en place). `reset()` retente le segment.
export default function DashError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div>
        <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cette section n’a pas pu se charger. Réessaie, ou recharge la page si le problème persiste.
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Réessayer
      </Button>
    </div>
  )
}
