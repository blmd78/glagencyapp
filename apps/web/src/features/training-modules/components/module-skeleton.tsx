import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de la page module : bouton de retour, podium du module, bloc titre/cours, puis la
 * liste des exercices — mêmes dimensions que le contenu réel (anti-CLS).
 */
export function ModuleSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-[46px] w-40 rounded-[11px]" />
        <Skeleton className="h-[248px] rounded-[18px]" />
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    </div>
  )
}
