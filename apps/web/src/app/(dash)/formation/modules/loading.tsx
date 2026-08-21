import { RouteLoading } from '@/components/skeletons/route-loading'
import { ModulesSkeleton } from '@/features/training-modules/components/modules-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-32">
      <ModulesSkeleton />
    </RouteLoading>
  )
}
