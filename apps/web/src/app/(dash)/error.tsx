'use client'

import { ErrorFallback } from '@/components/error-fallback'

// Filet d'erreur au niveau du dashboard : une erreur de rendu/service ne fait tomber que la
// zone `children` (le layout, sidebar comprise, reste en place). `unstable_retry()` re-fetch
// et re-rend le segment (Next 16.2 — contrairement à l'ancien `reset()`).
export default function DashError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <ErrorFallback error={error} retry={unstable_retry} />
}
