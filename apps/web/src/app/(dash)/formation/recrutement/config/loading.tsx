import { RouteLoading } from '@/components/skeletons/route-loading'
import { ConfigSkeleton } from '@/features/recruit-admin/components/recruit-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-44">
      <ConfigSkeleton />
    </RouteLoading>
  )
}
