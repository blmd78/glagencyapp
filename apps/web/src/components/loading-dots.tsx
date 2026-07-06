import { cn } from '@/lib/utils'

/** Indicateur de chargement « trois points » — partagé (navigation, sélecteurs). */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Chargement"
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.32s]" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.16s]" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/70" />
    </span>
  )
}
