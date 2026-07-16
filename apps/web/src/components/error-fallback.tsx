'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

/**
 * Fallback partagé des error.tsx. Capture Sentry ici (les erreurs attrapées par une
 * boundary n'atteignent JAMAIS le handler global — doc Sentry) ; côté serveur,
 * onRequestError a déjà capturé l'erreur d'origine (ici on ne voit que le digest).
 */
export function ErrorFallback({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
    >
      <div>
        <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cette section n’a pas pu se charger. Réessaie, ou recharge la page si le problème
          persiste.
        </p>
      </div>
      <Button onClick={retry} variant="outline" size="sm">
        Réessayer
      </Button>
    </div>
  )
}
