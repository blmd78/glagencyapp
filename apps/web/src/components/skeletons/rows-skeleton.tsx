import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette d'une pile de lignes repliées (`MembersAccordion`), dimensions ~ contenu final
 *  (anti-CLS). A11y portée ici une fois pour toutes — cf. guidelines-standard-feature §2.3. */
export function RowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-12 w-full rounded-md" />
      ))}
    </div>
  )
}
