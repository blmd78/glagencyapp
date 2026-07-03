'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Filet global : erreurs de rendu React non rattrapées par un error.tsx de segment.
// Remplace le root layout quand il se déclenche → doit rendre <html>/<body> lui-même.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
          <p>Une erreur est survenue. Recharge la page ou réessaie plus tard.</p>
        </main>
      </body>
    </html>
  )
}
