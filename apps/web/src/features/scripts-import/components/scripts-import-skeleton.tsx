import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de l'écran d'import : carte Notion, liste des scripts, historique. */
export function ScriptsImportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
