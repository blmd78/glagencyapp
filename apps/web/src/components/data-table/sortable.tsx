import { type Column } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Alignement/largeur de colonne portés par la meta (façon shadcn data-table). Augmentation globale.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: 'right' | 'center'
    /** Classes appliquées au <th> ET au <td> (ex. `w-12` pour une colonne étroite). */
    className?: string
  }
}

export const alignClass = (a?: 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''

/** Entête triable façon shadcn data-table (flèche ↕). Générique sur la ligne. */
export function Sortable<T>({
  column,
  label,
  className,
}: {
  column: Column<T, unknown>
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className={cn('inline-flex items-center gap-1 hover:text-foreground', className)}
    >
      {label}
      <ArrowUpDown className="size-3.5 opacity-60" />
    </button>
  )
}
