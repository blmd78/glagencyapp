'use client'

import { ErrorFallback } from '@/components/error-fallback'

// unstable_retry (Next 16.2) : re-fetch + re-render du segment (reset() ne re-fetch pas).
export default function MarketingError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <ErrorFallback error={error} retry={unstable_retry} />
}
