import { RouteLoading } from '@/components/skeletons/route-loading'
import { CatalogSkeleton } from '@/features/training-catalog/components/catalog-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-40">
      <CatalogSkeleton />
    </RouteLoading>
  )
}
