import { RouteLoading } from '@/components/skeletons/route-loading'
import { SpendersListeSkeleton } from '@/features/spenders/components/spenders-liste-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-32">
      <SpendersListeSkeleton />
    </RouteLoading>
  )
}
