import { Skeleton } from '@/components/ui/skeleton'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'

/**
 * Silhouette de la page Dashboard — partagée par `loading.tsx` et le fallback `<Suspense>`
 * de la page (guidelines-standard-feature §2.4). Depuis 2026-07-26 la page est un sélecteur
 * de personne (à droite) au-dessus d'une pile de noms repliés (`components/member-select.tsx`
 * + `reports-members.tsx`) : elle compose donc la brique générique `RowsSkeleton`, qui porte
 * déjà le `role="status"` — ne pas le redoubler ici (§2.3). Le cas « rédacteur seul »
 * (personne d'autre à consulter → panneau à plat, sans sélecteur) n'a pas de silhouette
 * dédiée : à ce stade la page ne sait pas encore dans lequel des deux cas elle est.
 */
export function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end" aria-hidden>
        <Skeleton className="h-9 w-52" />
      </div>
      <RowsSkeleton count={4} />
    </div>
  )
}
