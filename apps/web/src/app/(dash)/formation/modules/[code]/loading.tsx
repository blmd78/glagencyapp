import { RouteLoading } from '@/components/skeletons/route-loading'
import { ModuleSkeleton } from '@/features/training-modules/components/module-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-8 w-64">
      <ModuleSkeleton />
    </RouteLoading>
  )
}
