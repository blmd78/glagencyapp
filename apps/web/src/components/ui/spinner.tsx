import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Spinner shadcn — à placer dans un Button avant le label (`data-icon="inline-start"`). */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Chargement"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
