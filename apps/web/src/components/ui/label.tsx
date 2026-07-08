import { cn } from '@/lib/utils'

/** Label de champ (rendu shadcn, sans dépendance radix — un <label> stylé suffit ici). */
function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot="label"
      className={cn('text-sm font-medium leading-none select-none', className)}
      {...props}
    />
  )
}

export { Label }
