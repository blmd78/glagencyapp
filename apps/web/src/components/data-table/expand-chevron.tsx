import type { Row } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Affordance d'accordéon PARTAGÉE des tables dépliables (1re cellule des lignes à
 * `getRowCanExpand` + `renderSubRows`) : chevron qui pivote quand la ligne est dépliée,
 * estompé quand elle ne peut pas l'être. Source unique — l'audit 2026-08-17 en a trouvé
 * quatre copies manuscrites (chatters, models, compta, police) qui commençaient à diverger.
 */
export function ExpandChevron<T>({ row }: { row: Row<T> }) {
  return (
    <ChevronRight
      className={cn(
        'size-4 shrink-0 text-muted-foreground transition-transform',
        row.getIsExpanded() && 'rotate-90',
        !row.getCanExpand() && 'opacity-0',
      )}
    />
  )
}
