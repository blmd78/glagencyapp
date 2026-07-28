import { Skeleton } from '@/components/ui/skeleton'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'

/**
 * Silhouette de la route (préfetchable). Le vrai `h1` s'affiche dès que `page.tsx` rend.
 *
 * La barre d'onglets a sa propre silhouette depuis le lot final : `page.tsx` la monte HORS des
 * boundaries (elle ne dépend d'aucune donnée), donc sans elle la page gagnerait une rangée d'un
 * coup au premier rendu et tout le contenu sauterait. Sa taille est celle d'un `TabsList` à trois
 * onglets. La silhouette du CONTENU reste celle de l'onglet Période : c'est la vue par défaut, et
 * `loading.tsx` s'affiche avant que les `searchParams` soient lus.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton aria-hidden="true" className="h-8 w-40" />
      <Skeleton aria-hidden="true" className="h-9 w-72" />
      <ComptaSkeleton />
    </div>
  )
}
