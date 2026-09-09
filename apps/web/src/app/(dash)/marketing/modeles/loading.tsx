import { RouteLoading } from '@/components/skeletons/route-loading'
import { MktModelesSkeleton } from '@/features/marketing-modeles/components/modeles-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-40" subtitle="h-4 w-40">
      <MktModelesSkeleton />
    </RouteLoading>
  )
}
