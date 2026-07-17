import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Silhouette de page complète (loading.tsx) : bloc titre + contenu. Largeurs = celles du site remplacé. */
export function RouteLoading({
  title = 'h-7 w-48',
  subtitle = 'h-4 w-72',
  children,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className={title} />
        <Skeleton className={subtitle} />
      </div>
      {children}
    </div>
  )
}

/** Fallback de <Suspense> d'une page à h1 immédiat : sous-titre -mt-4 + contenu. */
export function SectionFallback({
  subtitle = 'h-4 w-72',
  children,
}: {
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className={cn('-mt-4', subtitle)} />
      {children}
    </div>
  )
}
